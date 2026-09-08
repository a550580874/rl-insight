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

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "tools/grafana/check_dashboard_duplicates.py"
DASHBOARD_DIR = ROOT / "rl_insight/config/services/grafana/dashboards/verl"
VLLM_DASHBOARD = DASHBOARD_DIR / "verl_tainer_v1_with_vllm_engine.json"
SGLANG_DASHBOARD = DASHBOARD_DIR / "verl_tainer_v1_with_sglang_engine.json"
COMMON_KEY = "panel-184"


def _prepare_dashboards(tmp_path: Path) -> tuple[Path, Path]:
    vllm = tmp_path / "vllm.json"
    sglang = tmp_path / "sglang.json"
    vllm.write_bytes(VLLM_DASHBOARD.read_bytes())
    sglang.write_bytes(SGLANG_DASHBOARD.read_bytes())
    return vllm, sglang


def _run(vllm: Path, sglang: Path, *args: str, input_text: str | None = None):
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--vllm-dashboard",
            str(vllm),
            "--sglang-dashboard",
            str(sglang),
            *args,
        ],
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )


def _introduce_common_drift(sglang_path: Path) -> None:
    dashboard = json.loads(sglang_path.read_text(encoding="utf-8"))
    dashboard["spec"]["elements"][COMMON_KEY]["spec"]["description"] = "drift"
    sglang_path.write_text(json.dumps(dashboard, indent=2) + "\n", encoding="utf-8")


def test_current_dashboards_have_no_common_drift(tmp_path: Path) -> None:
    vllm, sglang = _prepare_dashboards(tmp_path)
    result = _run(vllm, sglang, "--check")

    assert result.returncode == 0
    assert "shared common elements: 116" in result.stdout
    assert "engine-local key collisions ignored: 7" in result.stdout


def test_check_reports_common_drift_without_writing(tmp_path: Path) -> None:
    vllm, sglang = _prepare_dashboards(tmp_path)
    _introduce_common_drift(sglang)
    before = sglang.read_bytes()

    result = _run(vllm, sglang, "--check")

    assert result.returncode == 1
    assert f"Common element differs: {COMMON_KEY}" in result.stdout
    assert sglang.read_bytes() == before


def test_prefer_vllm_resolves_all_common_drift(tmp_path: Path) -> None:
    vllm, sglang = _prepare_dashboards(tmp_path)
    _introduce_common_drift(sglang)

    result = _run(vllm, sglang, "--prefer", "vllm")

    assert result.returncode == 0
    vllm_data = json.loads(vllm.read_text(encoding="utf-8"))
    sglang_data = json.loads(sglang.read_text(encoding="utf-8"))
    assert (
        vllm_data["spec"]["elements"][COMMON_KEY]
        == sglang_data["spec"]["elements"][COMMON_KEY]
    )


def test_interactive_enter_defaults_to_vllm(tmp_path: Path) -> None:
    vllm, sglang = _prepare_dashboards(tmp_path)
    _introduce_common_drift(sglang)

    result = _run(vllm, sglang, input_text="\n")

    assert result.returncode == 0
    assert "Use [V]LLM (default)" in result.stdout
    vllm_data = json.loads(vllm.read_text(encoding="utf-8"))
    sglang_data = json.loads(sglang.read_text(encoding="utf-8"))
    assert (
        vllm_data["spec"]["elements"][COMMON_KEY]
        == sglang_data["spec"]["elements"][COMMON_KEY]
    )
