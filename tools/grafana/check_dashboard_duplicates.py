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

"""Check and reconcile duplicated elements in the vLLM and SGLang dashboards."""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DASHBOARD_DIR = ROOT / "rl_insight/config/services/grafana/dashboards/verl"
DEFAULT_VLLM_DASHBOARD = DASHBOARD_DIR / "verl_tainer_v1_with_vllm_engine.json"
DEFAULT_SGLANG_DASHBOARD = DASHBOARD_DIR / "verl_tainer_v1_with_sglang_engine.json"


def _load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def _write_json(path: Path, dashboard: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(dashboard, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def _element_references(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        if value.get("kind") == "ElementReference":
            yield value["name"]
        for child in value.values():
            yield from _element_references(child)
    elif isinstance(value, list):
        for child in value:
            yield from _element_references(child)


def _engine_element_keys(dashboard: dict[str, Any]) -> set[str]:
    """Return elements referenced by the dashboard's engine-specific row."""
    rows = dashboard["spec"]["layout"]["spec"]["rows"]
    engine_keys: set[str] = set()
    for row in rows:
        title = str(row.get("spec", {}).get("title", "")).lower()
        if title.endswith(" engine metric"):
            engine_keys.update(_element_references(row))
    return engine_keys


def _common_and_mismatched_keys(
    vllm: dict[str, Any], sglang: dict[str, Any]
) -> tuple[set[str], set[str], list[str]]:
    """Classify shared keys and exclude intentional engine-local key reuse."""
    vllm_elements = vllm["spec"]["elements"]
    sglang_elements = sglang["spec"]["elements"]
    shared_keys = set(vllm_elements) & set(sglang_elements)
    engine_keys = _engine_element_keys(vllm) | _engine_element_keys(sglang)
    common_keys = shared_keys - engine_keys
    mismatched = sorted(
        key for key in common_keys if vllm_elements[key] != sglang_elements[key]
    )
    return common_keys, shared_keys & engine_keys, mismatched


def _leaf_differences(
    vllm: Any, sglang: Any, path: str = ""
) -> Iterable[tuple[str, Any, Any]]:
    if isinstance(vllm, dict) and isinstance(sglang, dict):
        for key in sorted(set(vllm) | set(sglang)):
            child_path = f"{path}.{key}" if path else key
            if key not in vllm:
                yield child_path, "<missing>", sglang[key]
            elif key not in sglang:
                yield child_path, vllm[key], "<missing>"
            else:
                yield from _leaf_differences(vllm[key], sglang[key], child_path)
    elif isinstance(vllm, list) and isinstance(sglang, list):
        if vllm != sglang:
            yield path, vllm, sglang
    elif vllm != sglang:
        yield path, vllm, sglang


def _print_summary(
    common_keys: set[str], engine_keys: set[str], mismatched: list[str]
) -> None:
    print(f"shared common elements: {len(common_keys)}")
    print(f"engine-local key collisions ignored: {len(engine_keys)}")
    print(f"mismatched common elements: {len(mismatched)}")


def _print_mismatch(
    key: str, vllm_element: dict[str, Any], sglang_element: dict[str, Any]
) -> None:
    print(f"\nCommon element differs: {key}")
    differences = list(_leaf_differences(vllm_element, sglang_element))
    for path, vllm_value, sglang_value in differences[:10]:
        print(f"  {path}")
        print(f"    vLLM:   {vllm_value!r}")
        print(f"    SGLang: {sglang_value!r}")
    if len(differences) > 10:
        print(f"  ... {len(differences) - 10} more differing fields")


def _apply_preference(
    key: str,
    preference: str,
    vllm_elements: dict[str, Any],
    sglang_elements: dict[str, Any],
) -> str:
    if preference == "vllm":
        sglang_elements[key] = deepcopy(vllm_elements[key])
        return "sglang"
    vllm_elements[key] = deepcopy(sglang_elements[key])
    return "vllm"


def _resolve_interactively(
    mismatched: list[str], vllm: dict[str, Any], sglang: dict[str, Any]
) -> tuple[bool, bool]:
    vllm_elements = vllm["spec"]["elements"]
    sglang_elements = sglang["spec"]["elements"]
    changed_vllm = False
    changed_sglang = False
    for key in mismatched:
        _print_mismatch(key, vllm_elements[key], sglang_elements[key])
        try:
            answer = input("Use [V]LLM (default), [S]GLang, s[K]ip, or [Q]uit? ")
        except EOFError:
            print("No input available; use --check or --prefer.", file=sys.stderr)
            raise
        choice = answer.strip().lower()
        if choice in {"", "v", "vllm"}:
            changed_sglang = True
            _apply_preference(key, "vllm", vllm_elements, sglang_elements)
        elif choice in {"s", "sglang"}:
            changed_vllm = True
            _apply_preference(key, "sglang", vllm_elements, sglang_elements)
        elif choice in {"k", "skip"}:
            continue
        elif choice in {"q", "quit"}:
            break
        else:
            print(f"Unknown choice {answer!r}; skipped {key}.")
    return changed_vllm, changed_sglang


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vllm-dashboard", type=Path, default=DEFAULT_VLLM_DASHBOARD)
    parser.add_argument(
        "--sglang-dashboard", type=Path, default=DEFAULT_SGLANG_DASHBOARD
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--check", action="store_true", help="report common drift without writing"
    )
    mode.add_argument(
        "--prefer",
        choices=("vllm", "sglang"),
        help="resolve all common drift non-interactively",
    )
    args = parser.parse_args()

    vllm = _load_json(args.vllm_dashboard)
    sglang = _load_json(args.sglang_dashboard)
    common_keys, engine_keys, mismatched = _common_and_mismatched_keys(vllm, sglang)
    _print_summary(common_keys, engine_keys, mismatched)
    if not mismatched:
        return 0
    if args.check:
        for key in mismatched:
            _print_mismatch(
                key, vllm["spec"]["elements"][key], sglang["spec"]["elements"][key]
            )
        return 1

    if args.prefer:
        changed_vllm = args.prefer == "sglang"
        changed_sglang = args.prefer == "vllm"
        for key in mismatched:
            _apply_preference(
                key,
                args.prefer,
                vllm["spec"]["elements"],
                sglang["spec"]["elements"],
            )
    else:
        try:
            changed_vllm, changed_sglang = _resolve_interactively(
                mismatched, vllm, sglang
            )
        except EOFError:
            return 2

    if changed_vllm:
        _write_json(args.vllm_dashboard, vllm)
        print(f"updated {args.vllm_dashboard}")
    if changed_sglang:
        _write_json(args.sglang_dashboard, sglang)
        print(f"updated {args.sglang_dashboard}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
