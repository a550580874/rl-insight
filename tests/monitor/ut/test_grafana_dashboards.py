# Copyright (c) 2026 verl-project authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Unit tests for Grafana dashboard directory staging."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from omegaconf import OmegaConf

from rl_insight.server.runtime import _stage_grafana_dashboards


ROOT = Path(__file__).resolve().parents[3]
GRAFANA_TOOLS = ROOT / "tools/grafana"
DASHBOARD_DIR = ROOT / "rl_insight/config/services/grafana/dashboards/verl"


def test_stage_copies_dashboard_subdirectories(tmp_path) -> None:
    source = tmp_path / "source"
    (source / "verl").mkdir(parents=True)
    (source / "verl" / "board.json").write_text("{}", encoding="utf-8")
    runtime_dir = tmp_path / "runtime"
    conf = OmegaConf.create({"grafana": {"dashboards_dir": str(source)}})

    staged = _stage_grafana_dashboards(conf, runtime_dir)

    assert (staged / "verl" / "board.json").is_file()


def test_generated_dashboards_are_up_to_date() -> None:
    completed = subprocess.run(
        [sys.executable, GRAFANA_TOOLS / "generate_dashboards.py", "--check"],
        cwd=ROOT,
        check=False,
    )

    assert completed.returncode == 0


def test_jsonnet_modules_keep_engine_differences_explicit() -> None:
    expression = """
      local common = import 'tools/grafana/dashboards/common.libsonnet';
      local vllm = import 'tools/grafana/dashboards/vllm.libsonnet';
      local sglang = import 'tools/grafana/dashboards/sglang.libsonnet';
      {
        common: std.length(common.panels) + std.length(common.trainingMetrics),
        vllm: std.length(vllm.panels),
        sglang: std.length(sglang.panels),
      }
    """
    completed = subprocess.run(
        ["jsonnet", "-e", expression],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    assert json.loads(completed.stdout) == {"common": 116, "vllm": 30, "sglang": 8}


def test_engine_dashboards_share_only_identical_panels() -> None:
    dashboards = {
        engine: json.loads(
            (DASHBOARD_DIR / f"verl_tainer_v1_with_{engine}_engine.json").read_text(
                encoding="utf-8"
            )
        )
        for engine in ("vllm", "sglang")
    }
    vllm_elements = dashboards["vllm"]["spec"]["elements"]
    sglang_elements = dashboards["sglang"]["spec"]["elements"]

    identical_panels = {
        key
        for key in vllm_elements.keys() & sglang_elements.keys()
        if vllm_elements[key] == sglang_elements[key]
    }

    assert len(identical_panels) == 116
    assert len(vllm_elements) == 146
    assert len(sglang_elements) == 124

    variable_names = {
        engine: {
            variable["spec"]["name"] for variable in dashboard["spec"]["variables"]
        }
        for engine, dashboard in dashboards.items()
    }
    assert "npu_instance" in variable_names["vllm"]
    assert "npu_instance" not in variable_names["sglang"]

    def references(value):
        if isinstance(value, dict):
            if value.get("kind") == "ElementReference":
                yield value["name"]
            for child in value.values():
                yield from references(child)
        elif isinstance(value, list):
            for child in value:
                yield from references(child)

    for dashboard in dashboards.values():
        elements = dashboard["spec"]["elements"]
        assert set(references(dashboard["spec"]["layout"])) <= elements.keys()
