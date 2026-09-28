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

"""Unit tests for Grafana dashboard preparation at server startup.

The runtime renders the Jsonnet sources that ship inside the installed package,
so no test here runs a generate/Jsonnet CLI. The renderer itself lives in
``rl_insight.grafana.renderer``, which the framework change this branch depends
on provides; the tests that exercise generation skip while it is absent.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from omegaconf import OmegaConf

from rl_insight.server import runtime as runtime_module
from rl_insight.utils.constants import MonitorPaths

BUNDLED_DASHBOARDS_DIR = MonitorPaths.GRAFANA_DASHBOARDS_DIR
JSONNET_DIR = MonitorPaths.GRAFANA_JSONNET_DIR
JSONNET_OUTPUT_DIR = MonitorPaths.GRAFANA_JSONNET_OUTPUT_DIR

#: Source files the runtime must never write to.
MONITORED_SOURCE_FILES = (
    MonitorPaths.GRAFANA_JSONNET_ENTRYPOINT,
    JSONNET_DIR / "dashboard_compositions.libsonnet",
    JSONNET_DIR / "dashboards" / "trainer.libsonnet",
    JSONNET_OUTPUT_DIR / "verl_tainer_v1_with_vllm_engine.json",
    JSONNET_OUTPUT_DIR / "verl_tainer_v1_with_sglang_engine.json",
    MonitorPaths.CONFIG_FILE,
)


def _conf(
    builtin: Path | None = None,
    extra: Path | None = None,
    dashboard_config: str = "",
):
    grafana = {
        "dashboards_dir": str(
            builtin if builtin is not None else BUNDLED_DASHBOARDS_DIR
        )
    }
    if dashboard_config:
        grafana["dashboard_config"] = dashboard_config
    if extra is not None:
        grafana["extra_dashboard_dir"] = str(extra)
    return OmegaConf.create({"grafana": grafana})


def _renderer():
    """Import the packaged renderer, skipping when the framework is absent."""
    return pytest.importorskip("rl_insight.grafana.renderer")


def _write_custom_config(directory: Path) -> Path:
    """Write a user composition config that imports the packaged framework."""
    composer = os.path.relpath(
        JSONNET_DIR / "framework" / "composer.libsonnet", directory
    )
    npu = os.path.relpath(JSONNET_DIR / "dashboards" / "npu.libsonnet", directory)
    config = directory / "custom.jsonnet"
    config.write_text(
        f"""
local composer = import '{composer}';
local npu = import '{npu}';

{{
  custom_board: composer.compose([npu], {{
    metadata: {{ name: 'custom-board', labels: {{}}, annotations: {{}} }},
    title: 'custom_board',
    tags: ['RL-Insight'],
    spec: {{ cursorSync: 'Crosshair' }},
    variableOrder: ['npu_instance'],
    rowOrder: [],
  }}),
}}
""",
        encoding="utf-8",
    )
    return config


# --------------------------------------------------------------------------
# Automatic generation from the package sources (no CLI involved)
# --------------------------------------------------------------------------


def test_prepare_renders_bundled_compositions_without_any_cli(tmp_path) -> None:
    renderer = _renderer()

    staged = runtime_module._prepare_grafana_dashboards(_conf(), tmp_path / "runtime")

    rendered = renderer.render_dashboards(MonitorPaths.GRAFANA_JSONNET_ENTRYPOINT)
    assert set(rendered) == {
        "verl_tainer_v1_with_sglang_engine",
        "verl_tainer_v1_with_vllm_engine",
    }
    # Rendered into the same Grafana folder the committed baseline used.
    assert (staged / "verl" / "verl_tainer_v1_with_vllm_engine.json").is_file()
    assert (staged / "verl" / "verl_tainer_v1_with_sglang_engine.json").is_file()


def test_prepare_renders_bundled_compositions_equal_to_committed_baseline(
    tmp_path,
) -> None:
    _renderer()

    staged = runtime_module._prepare_grafana_dashboards(_conf(), tmp_path / "runtime")

    for name in (
        "verl_tainer_v1_with_vllm_engine",
        "verl_tainer_v1_with_sglang_engine",
    ):
        generated = json.loads(
            (staged / "verl" / f"{name}.json").read_text(encoding="utf-8")
        )
        committed = json.loads(
            (JSONNET_OUTPUT_DIR / f"{name}.json").read_text(encoding="utf-8")
        )
        assert generated == committed, f"{name} drifted from the committed baseline"


def test_prepare_keeps_every_other_bundled_dashboard(tmp_path) -> None:
    _renderer()

    staged = runtime_module._prepare_grafana_dashboards(_conf(), tmp_path / "runtime")

    assert (staged / "quick_start_demo" / "quick_start_demo.json").is_file()
    assert (staged / "agent_loop_trajectory" / "agent_loop_trajectory.json").is_file()
    assert (
        staged / "verl-omni" / "verl_omni_trainer_v1_with_vllm_omni_engine.json"
    ).is_file()


def test_prepare_renders_explicit_dashboard_config(tmp_path) -> None:
    _renderer()

    config = _write_custom_config(tmp_path)

    staged = runtime_module._prepare_grafana_dashboards(
        _conf(dashboard_config=str(config)), tmp_path / "runtime"
    )

    written = json.loads(
        (
            staged / MonitorPaths.GRAFANA_JSONNET_OUTPUT_SUBDIR / "custom_board.json"
        ).read_text(encoding="utf-8")
    )
    assert written["spec"]["title"] == "custom_board"
    assert written["metadata"]["name"] == "custom-board"


def test_prepare_rejects_missing_dashboard_config(tmp_path) -> None:
    _renderer()

    missing = tmp_path / "nope.jsonnet"
    with pytest.raises(RuntimeError, match="does not exist"):
        runtime_module._prepare_grafana_dashboards(
            _conf(dashboard_config=str(missing)), tmp_path / "runtime"
        )


def test_prepare_rejects_invalid_dashboard_config(tmp_path) -> None:
    _renderer()

    config = tmp_path / "broken.jsonnet"
    config.write_text("{ this is not jsonnet", encoding="utf-8")

    with pytest.raises(RuntimeError) as error:
        runtime_module._prepare_grafana_dashboards(
            _conf(dashboard_config=str(config)), tmp_path / "runtime"
        )

    assert str(config) in str(error.value)
    assert "generation failed" in str(error.value)


def test_prepare_writes_only_into_the_runtime_directory(tmp_path) -> None:
    _renderer()
    before = {path: path.read_bytes() for path in MONITORED_SOURCE_FILES}

    runtime_module._prepare_grafana_dashboards(_conf(), tmp_path / "runtime")

    assert {path: path.read_bytes() for path in MONITORED_SOURCE_FILES} == before


# --------------------------------------------------------------------------
# Legacy static directory (custom `grafana.dashboards_dir`)
# --------------------------------------------------------------------------


def test_stage_copies_builtin_and_extra_without_parsing_json(tmp_path) -> None:
    builtin = tmp_path / "builtin"
    extra = tmp_path / "extra"
    (builtin / "verl").mkdir(parents=True)
    (extra / "custom").mkdir(parents=True)
    (builtin / "verl" / "board.json").write_text("{}", encoding="utf-8")
    (extra / "custom" / "router.json").write_text("not valid json", encoding="utf-8")

    staged = runtime_module._prepare_grafana_dashboards(
        _conf(builtin, extra), tmp_path / "runtime"
    )

    assert (staged / "verl" / "board.json").is_file()
    assert (staged / "custom" / "router.json").read_text(encoding="utf-8") == (
        "not valid json"
    )


def test_stage_rejects_json_collision_before_copying_extra(tmp_path) -> None:
    builtin = tmp_path / "builtin"
    extra = tmp_path / "extra"
    (builtin / "shared").mkdir(parents=True)
    (extra / "shared").mkdir(parents=True)
    (builtin / "shared" / "board.json").write_text("builtin", encoding="utf-8")
    (extra / "unique.json").write_text("extra", encoding="utf-8")
    (extra / "shared" / "board.json").write_text("conflict", encoding="utf-8")

    runtime_dir = tmp_path / "runtime"
    with pytest.raises(RuntimeError, match="already exists in runtime dashboards"):
        runtime_module._prepare_grafana_dashboards(
            _conf(builtin, extra),
            runtime_dir,
        )

    staged = runtime_dir / "dashboards"
    assert (staged / "shared" / "board.json").read_text(encoding="utf-8") == "builtin"
    assert not (staged / "unique.json").exists()


def test_stage_refreshes_extra_in_shared_builtin_directory(tmp_path) -> None:
    builtin = tmp_path / "builtin"
    extra = tmp_path / "extra"
    (builtin / "shared").mkdir(parents=True)
    (extra / "shared").mkdir(parents=True)
    (builtin / "shared" / "builtin.json").write_text("builtin", encoding="utf-8")
    extra_dashboard = extra / "shared" / "extra.json"
    extra_dashboard.write_text("first", encoding="utf-8")
    runtime_dir = tmp_path / "runtime"

    runtime_module._prepare_grafana_dashboards(_conf(builtin, extra), runtime_dir)
    extra_dashboard.write_text("second", encoding="utf-8")
    staged = runtime_module._prepare_grafana_dashboards(
        _conf(builtin, extra), runtime_dir
    )

    assert (staged / "shared" / "extra.json").read_text(encoding="utf-8") == "second"


def test_stage_drops_stale_files_between_starts(tmp_path) -> None:
    builtin = tmp_path / "builtin"
    (builtin / "verl").mkdir(parents=True)
    board = builtin / "verl" / "board.json"
    board.write_text("{}", encoding="utf-8")
    runtime_dir = tmp_path / "runtime"

    runtime_module._prepare_grafana_dashboards(_conf(builtin), runtime_dir)
    board.unlink()
    staged = runtime_module._prepare_grafana_dashboards(_conf(builtin), runtime_dir)

    assert not (staged / "verl" / "board.json").exists()


def test_prepare_rejects_missing_legacy_dashboards_dir(tmp_path) -> None:
    with pytest.raises(RuntimeError, match="does not exist"):
        runtime_module._prepare_grafana_dashboards(
            _conf(tmp_path / "absent"), tmp_path / "runtime"
        )


@pytest.mark.parametrize(
    ("entry_type", "expected_error"),
    [("missing", "does not exist"), ("file", "is not a directory")],
)
def test_stage_rejects_invalid_extra_directory(
    tmp_path, entry_type: str, expected_error: str
) -> None:
    builtin = tmp_path / "builtin"
    builtin.mkdir()
    extra = tmp_path / entry_type
    if entry_type == "file":
        extra.write_text("not a directory", encoding="utf-8")

    with pytest.raises(RuntimeError, match=expected_error):
        runtime_module._prepare_grafana_dashboards(
            _conf(builtin, extra), tmp_path / "runtime"
        )


# --------------------------------------------------------------------------
# Generated dashboards and `extra_dashboard_dir` together
# --------------------------------------------------------------------------


def test_prepare_generated_and_extra_dashboards_coexist(tmp_path) -> None:
    _renderer()

    extra = tmp_path / "extra"
    (extra / "custom").mkdir(parents=True)
    (extra / "custom" / "router.json").write_text("{}", encoding="utf-8")

    staged = runtime_module._prepare_grafana_dashboards(
        _conf(extra=extra), tmp_path / "runtime"
    )

    assert (staged / "custom" / "router.json").is_file()
    assert (staged / "verl" / "verl_tainer_v1_with_vllm_engine.json").is_file()


def test_prepare_keeps_collision_detection_against_generated_dashboards(
    tmp_path,
) -> None:
    _renderer()

    extra = tmp_path / "extra"
    (extra / "verl").mkdir(parents=True)
    (extra / "verl" / "verl_tainer_v1_with_vllm_engine.json").write_text(
        "{}", encoding="utf-8"
    )

    with pytest.raises(RuntimeError, match="already exists in runtime dashboards"):
        runtime_module._prepare_grafana_dashboards(
            _conf(extra=extra), tmp_path / "runtime"
        )
