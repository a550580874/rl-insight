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

"""Tests for the generic Grafana dashboard composition framework.

The framework lives under ``tools/grafana/framework`` and is independent of any
production dashboard.  These tests render the A/B/C/D example modules and
exercise the composer's explicit merge/conflict rules through the generator
CLI, the same entrypoint CI would use.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
FRAMEWORK = REPO_ROOT / "tools" / "grafana" / "framework"
GENERATE = FRAMEWORK / "generate.py"
EXAMPLES = FRAMEWORK / "examples"
COMPOSER = FRAMEWORK / "composer.libsonnet"


def run_generate(*args: str, expect: int = 0) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        [sys.executable, str(GENERATE), *args], capture_output=True, text=True
    )
    assert proc.returncode == expect, (
        f"expected rc={expect}, got {proc.returncode}\n"
        f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
    )
    return proc


def config_path(name: str) -> Path:
    return EXAMPLES / "dashboards" / f"{name}.jsonnet"


def write_config(tmp_path: Path, body: str) -> Path:
    tmp_path.mkdir(parents=True, exist_ok=True)
    path = tmp_path / "compose.jsonnet"
    path.write_text(body, encoding="utf-8")
    return path


def inline_module(prefix: str, panel_id: int, tags: list[str] | None = None) -> str:
    # JSON is a Jsonnet subset, so the toy modules are built as Python data and
    # dumped - no hand-written nesting to get wrong.
    module: dict = {
        "panels": [
            {
                "key": f"{prefix}.panel",
                "outputKey": f"{prefix}-panel",
                "id": panel_id,
                "title": f"{prefix} panel",
                "queries": [{"expr": f"toy_{prefix}_metric"}],
            }
        ],
        "rows": {
            f"{prefix}-row": {
                "kind": "RowsLayoutRow",
                "spec": {
                    "title": f"{prefix} row",
                    "collapse": False,
                    "layout": {
                        "kind": "GridLayout",
                        "spec": {
                            "items": [
                                {
                                    "kind": "GridLayoutItem",
                                    "spec": {
                                        "x": 0,
                                        "y": 0,
                                        "width": 12,
                                        "height": 8,
                                        "element": {
                                            "kind": "ElementReference",
                                            "name": f"{prefix}.panel",
                                        },
                                    },
                                }
                            ]
                        },
                    },
                },
            }
        },
        "variables": {
            f"zone_{prefix}": {
                "kind": "ConstantVariable",
                "spec": {
                    "name": f"zone_{prefix}",
                    "label": "Zone",
                    "value": "z1",
                    "hide": "dontHide",
                },
            }
        },
    }
    if tags is not None:
        module["tags"] = tags
    return f"local {prefix} = " + json.dumps(module) + ";"


def compose_config(
    tmp_path: Path, modules: list[tuple[str, int, list[str] | None]], dashboard: str
) -> Path:
    body = "".join(
        inline_module(prefix, panel_id, tags) for prefix, panel_id, tags in modules
    )
    module_names = [prefix for prefix, _, _ in modules]
    body += (
        "local composer = import '" + str(COMPOSER) + "';\n"
        "{ compose: composer.compose(["
        + ", ".join(module_names)
        + "], "
        + dashboard
        + ") }\n"
    )
    return write_config(tmp_path, body)


DASHBOARD = (
    "{ metadata: { name: 'toy', uid: 'toy' }, title: 'Toy dashboard', "
    "tags: ['example'], spec: {}, variableOrder: %s, rowOrder: %s }"
)


def test_example_dashboards_render_deterministically(tmp_path: Path) -> None:
    for name in ("ab", "acd"):
        first = tmp_path / f"{name}-1"
        second = tmp_path / f"{name}-2"
        run_generate("--config", str(config_path(name)), "--out-dir", str(first))
        run_generate("--config", str(config_path(name)), "--out-dir", str(second))
        rendered = (first / f"{name}.json").read_text(encoding="utf-8")
        assert rendered == (second / f"{name}.json").read_text(encoding="utf-8")
        assert rendered == (EXAMPLES / "expected" / f"{name}.json").read_text(
            encoding="utf-8"
        )


def test_example_dashboard_composes_modules_with_resolved_references() -> None:
    spec = json.loads((EXAMPLES / "expected" / "ab.json").read_text(encoding="utf-8"))[
        "spec"
    ]
    # Module order (A then B) and the composition config decide layout.
    assert [row["spec"]["title"] for row in spec["layout"]["spec"]["rows"]] == [
        "A overview",
        "A details",
        "B row",
    ]
    # Layout rows may reference panels from *other* modules by `key`; the
    # composer resolves them to the panel's `outputKey` when rendering.
    b_row = spec["layout"]["spec"]["rows"][2]
    referenced = [
        item["spec"]["element"]["name"]
        for item in b_row["spec"]["layout"]["spec"]["items"]
    ]
    assert "a-request-rate" in referenced
    assert referenced[0] == "b-saturation"
    # Same module A, different companions: the A+C+D dashboard reuses A's
    # panels and rows unchanged.
    acd = json.loads((EXAMPLES / "expected" / "acd.json").read_text(encoding="utf-8"))[
        "spec"
    ]
    assert [row["spec"]["title"] for row in acd["layout"]["spec"]["rows"]] == [
        "A overview",
        "C row",
        "A details",
        "D row",
    ]


def test_check_mode_passes_for_the_committed_examples() -> None:
    for name in ("ab", "acd"):
        run_generate(
            "--config",
            str(config_path(name)),
            "--check",
            "--expected-dir",
            str(EXAMPLES / "expected"),
        )


def test_check_mode_detects_stale_expected_output(tmp_path: Path) -> None:
    stale_dir = tmp_path / "expected"
    stale_dir.mkdir()
    stale = json.loads((EXAMPLES / "expected" / "ab.json").read_text(encoding="utf-8"))
    stale["spec"]["title"] = "tampered"
    (stale_dir / "ab.json").write_text(
        json.dumps(stale, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    proc = run_generate(
        "--config",
        str(config_path("ab")),
        "--check",
        "--expected-dir",
        str(stale_dir),
        expect=1,
    )
    assert "ab.json" in proc.stderr


def test_duplicate_panel_key_is_rejected(tmp_path: Path) -> None:
    config = compose_config(
        tmp_path,
        [("m1", 1, None), ("m1", 1, None)],
        DASHBOARD % ("['zone_m1']", "['m1-row']"),
    )
    proc = run_generate(
        "--config", str(config), "--out-dir", str(tmp_path / "out"), expect=2
    )
    assert "duplicate panel key(s)" in proc.stderr


def test_duplicate_panel_id_is_rejected(tmp_path: Path) -> None:
    config = compose_config(
        tmp_path,
        [("m1", 1, None), ("m2", 1, None)],
        DASHBOARD % ("['zone_m1']", "['m1-row']"),
    )
    proc = run_generate(
        "--config", str(config), "--out-dir", str(tmp_path / "out"), expect=2
    )
    assert "duplicate panel id(s)" in proc.stderr


def test_duplicate_row_name_is_rejected(tmp_path: Path) -> None:
    body = (
        inline_module("m1", 1, None).replace("m1-row", "shared-row")
        + inline_module("m2", 2, None).replace("m2-row", "shared-row")
        + "local composer = import '"
        + str(COMPOSER)
        + "';\n"
        + "composer.compose([m1, m2], "
        + DASHBOARD % ("['zone_m1']", "['shared-row']")
        + ")\n"
    )
    config = write_config(tmp_path, body)
    proc = run_generate(
        "--config", str(config), "--out-dir", str(tmp_path / "out"), expect=2
    )
    assert "duplicate row name(s)" in proc.stderr


def test_duplicate_panel_output_key_is_rejected(tmp_path: Path) -> None:
    body = (
        inline_module("m1", 1, None)
        + inline_module("m2", 2, None).replace("m2-panel", "m1-panel")
        + "local composer = import '"
        + str(COMPOSER)
        + "';\n"
        + "{ compose: composer.compose([m1, m2], "
        + DASHBOARD % ("['zone_m1']", "['m1-row']")
        + ") }\n"
    )
    config = write_config(tmp_path, body)
    proc = run_generate(
        "--config", str(config), "--out-dir", str(tmp_path / "out"), expect=2
    )
    assert "duplicate panel outputKey(s)" in proc.stderr


def test_duplicate_variable_name_is_rejected(tmp_path: Path) -> None:
    body = (
        inline_module("m1", 1, None)
        + inline_module("m2", 2, None).replace("zone_m2", "zone_m1")
        + "local composer = import '"
        + str(COMPOSER)
        + "';\n"
        + "{ compose: composer.compose([m1, m2], "
        + DASHBOARD % ("['zone_m1']", "['m1-row']")
        + ") }\n"
    )
    config = write_config(tmp_path, body)
    proc = run_generate(
        "--config", str(config), "--out-dir", str(tmp_path / "out"), expect=2
    )
    assert "duplicate variable name(s)" in proc.stderr


def test_unknown_variable_in_variable_order_is_rejected(tmp_path: Path) -> None:
    config = compose_config(
        tmp_path,
        [("m1", 1, None), ("m2", 2, None)],
        DASHBOARD % ("['zone_m1', 'missing_var']", "['m1-row']"),
    )
    proc = run_generate(
        "--config", str(config), "--out-dir", str(tmp_path / "out"), expect=2
    )
    assert "unknown variable(s) in variableOrder: missing_var" in proc.stderr


def test_unknown_row_in_row_order_is_rejected(tmp_path: Path) -> None:
    config = compose_config(
        tmp_path,
        [("m1", 1, None), ("m2", 2, None)],
        DASHBOARD % ("['zone_m1']", "['m1-row', 'missing_row']"),
    )
    proc = run_generate(
        "--config", str(config), "--out-dir", str(tmp_path / "out"), expect=2
    )
    assert "unknown row(s) in rowOrder: missing_row" in proc.stderr


def test_composition_order_decides_tag_sequence(tmp_path: Path) -> None:
    forward = compose_config(
        tmp_path / "forward",
        [("m1", 1, ["one"]), ("m2", 2, ["two"])],
        DASHBOARD % ("['zone_m1']", "['m1-row']"),
    )
    reversed_config = compose_config(
        tmp_path / "reversed",
        [("m2", 2, ["two"]), ("m1", 1, ["one"])],
        DASHBOARD % ("['zone_m1']", "['m1-row']"),
    )
    out_forward = tmp_path / "out-forward"
    out_reversed = tmp_path / "out-reversed"
    run_generate("--config", str(forward), "--out-dir", str(out_forward))
    run_generate("--config", str(reversed_config), "--out-dir", str(out_reversed))
    tags_forward = json.loads(
        (out_forward / "compose.json").read_text(encoding="utf-8")
    )["spec"]["tags"]
    tags_reversed = json.loads(
        (out_reversed / "compose.json").read_text(encoding="utf-8")
    )["spec"]["tags"]
    assert tags_forward == ["example", "one", "two"]
    assert tags_reversed == ["example", "two", "one"]


def test_variable_order_follows_the_composition_config(tmp_path: Path) -> None:
    forward = compose_config(
        tmp_path / "forward",
        [("m1", 1, None), ("m2", 2, None)],
        DASHBOARD % ("['zone_m1', 'zone_m2']", "['m1-row']"),
    )
    reversed_config = compose_config(
        tmp_path / "reversed",
        [("m1", 1, None), ("m2", 2, None)],
        DASHBOARD % ("['zone_m2', 'zone_m1']", "['m1-row']"),
    )
    out_forward = tmp_path / "out-forward"
    out_reversed = tmp_path / "out-reversed"
    run_generate("--config", str(forward), "--out-dir", str(out_forward))
    run_generate("--config", str(reversed_config), "--out-dir", str(out_reversed))
    names_forward = [
        variable["spec"]["name"]
        for variable in json.loads(
            (out_forward / "compose.json").read_text(encoding="utf-8")
        )["spec"]["variables"]
    ]
    names_reversed = [
        variable["spec"]["name"]
        for variable in json.loads(
            (out_reversed / "compose.json").read_text(encoding="utf-8")
        )["spec"]["variables"]
    ]
    assert names_forward == ["zone_m1", "zone_m2"]
    assert names_reversed == ["zone_m2", "zone_m1"]
