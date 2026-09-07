#!/usr/bin/env python3
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

"""Build the committed Grafana dashboards from reusable source modules."""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(__file__).with_name("dashboard_sources")
DASHBOARD_DIR = ROOT / "rl_insight/config/services/grafana/dashboards/verl"
COMMON_MODULES = ("trajectory", "training", "controller", "storage", "hardware")
ENGINES = ("vllm", "sglang")


def _load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def load_sources() -> tuple[
    dict[str, Any], dict[str, dict[str, Any]], dict[str, dict[str, Any]]
]:
    """Load the manifest, reusable modules, and engine-specific modules."""
    manifest = _load_json(SOURCE_DIR / "manifest.json")
    common = {
        name: _load_json(SOURCE_DIR / "common" / f"{name}.json")
        for name in COMMON_MODULES
    }
    engines = {
        name: _load_json(SOURCE_DIR / "engines" / f"{name}.json") for name in ENGINES
    }
    return manifest, common, engines


def _element_fingerprint(element: dict[str, Any]) -> str:
    return json.dumps(
        element, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )


def validate_modules(modules: dict[str, dict[str, Any]]) -> None:
    """Reject duplicate keys and copied panel definitions across source modules."""
    key_owners: dict[str, str] = {}
    panel_owners: dict[str, tuple[str, str]] = {}
    for module_name, module in modules.items():
        for key, element in module["elements"].items():
            if key in key_owners:
                raise ValueError(
                    f"element {key!r} is defined by both {key_owners[key]} and {module_name}"
                )
            key_owners[key] = module_name
            fingerprint = _element_fingerprint(element)
            if fingerprint in panel_owners:
                owner, owner_key = panel_owners[fingerprint]
                raise ValueError(
                    f"duplicate element definitions: {owner}.{owner_key} and {module_name}.{key}"
                )
            panel_owners[fingerprint] = (module_name, key)


def _transfer_queue_row(
    controller: dict[str, Any], storage: dict[str, Any]
) -> dict[str, Any]:
    return {
        "kind": "RowsLayoutRow",
        "spec": {
            "title": "transfer queue metric",
            "collapse": True,
            "layout": {
                "kind": "RowsLayout",
                "spec": {"rows": deepcopy(controller["rows"] + storage["rows"])},
            },
        },
    }


def build_dashboard(
    engine: str,
    manifest: dict[str, Any] | None = None,
    common: dict[str, dict[str, Any]] | None = None,
    engines: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Compose one dashboard without mutating any source module."""
    if manifest is None or common is None or engines is None:
        manifest, common, engines = load_sources()
    if engine not in engines:
        raise ValueError(f"unsupported engine: {engine}")

    selected_modules = {**common, engine: engines[engine]}
    validate_modules(selected_modules)

    config = manifest["dashboards"][engine]
    dashboard = {
        "apiVersion": manifest["apiVersion"],
        "kind": manifest["kind"],
        "metadata": deepcopy(config["metadata"]),
        "spec": deepcopy(manifest["spec"]),
    }
    spec = dashboard["spec"]
    spec.update(
        {
            "elements": {},
            "layout": {
                "kind": "RowsLayout",
                "spec": {
                    "rows": [
                        deepcopy(common["trajectory"]["row"]),
                        deepcopy(common["training"]["row"]),
                        deepcopy(engines[engine]["row"]),
                        _transfer_queue_row(common["controller"], common["storage"]),
                        deepcopy(common["hardware"]["row"]),
                    ]
                },
            },
            "tags": deepcopy(config["tags"]),
            "title": config["title"],
            "variables": deepcopy(config["variables"]),
        }
    )
    for name in (*COMMON_MODULES, engine):
        module = common[name] if name in common else engines[name]
        spec["elements"].update(deepcopy(module["elements"]))
    return dashboard


def render_dashboards() -> dict[Path, str]:
    manifest, common, engines = load_sources()
    return {
        DASHBOARD_DIR / manifest["dashboards"][engine]["output"]: _canonical_json(
            build_dashboard(engine, manifest, common, engines)
        )
        for engine in ENGINES
    }


def _check(rendered: dict[Path, str]) -> int:
    stale = [
        path
        for path, content in rendered.items()
        if not path.is_file() or path.read_text() != content
    ]
    if stale:
        for path in stale:
            print(f"out of date: {path.relative_to(ROOT)}", file=sys.stderr)
        print("Run: python3 tools/grafana/generate_dashboards.py", file=sys.stderr)
        return 1
    print("Grafana dashboards are up to date.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="fail if committed dashboards are stale"
    )
    args = parser.parse_args()
    rendered = render_dashboards()
    if args.check:
        return _check(rendered)
    for path, content in rendered.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(f"generated {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
