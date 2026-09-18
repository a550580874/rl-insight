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

"""Deterministically render Grafana dashboard JSON from a composition config.

A composition config is a Jsonnet file that imports the generic composer and
evaluates to ``{ "<dashboard-name>": <dashboard resource> }``, where each
dashboard resource is the object returned by ``composer.compose(modules,
dashboard)`` for that dashboard. Rendering is deterministic: go-jsonnet emits
object fields in sorted order, and the writer uses a fixed indentation, so two
runs over the same sources always produce byte-identical files.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    import _gojsonnet
except ImportError:  # pragma: no cover - exercised via the CLI error path
    _gojsonnet = None


def render(config: Path) -> dict[str, Any]:
    """Evaluate the composition config and return its dashboards."""
    if _gojsonnet is None:
        raise RuntimeError(
            "gojsonnet is required; install it with: pip install 'gojsonnet>=0.22.0'"
        )
    try:
        rendered = _gojsonnet.evaluate_file(str(config))
    except RuntimeError as error:
        raise RuntimeError(
            f"Jsonnet evaluation failed for {config}: {error}"
        ) from error
    dashboards = json.loads(rendered)
    if not isinstance(dashboards, dict) or not dashboards:
        raise RuntimeError(
            f"{config} must evaluate to a non-empty object of dashboards"
        )
    return dashboards


def generated_text(dashboard: Any) -> str:
    """Serialize one dashboard deterministically."""
    return json.dumps(dashboard, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config", type=Path, required=True, help="composition config (.jsonnet)"
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        help="directory to write <dashboard-name>.json files into",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="compare against expected files instead of writing (exit 1 on mismatch)",
    )
    parser.add_argument(
        "--expected-dir",
        type=Path,
        help="directory holding the expected files for --check (default: --out-dir)",
    )
    args = parser.parse_args()

    if not args.check and args.out_dir is None:
        parser.error("--out-dir is required unless --check is used")
    expected_dir = args.expected_dir if args.expected_dir is not None else args.out_dir

    try:
        dashboards = render(args.config)
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if args.check:
        if expected_dir is None:
            print(
                "error: --check requires --expected-dir (or --out-dir)", file=sys.stderr
            )
            return 2
        stale: list[Path] = []
        for name, dashboard in dashboards.items():
            path = expected_dir / f"{name}.json"
            if not path.exists() or path.read_text(encoding="utf-8") != generated_text(
                dashboard
            ):
                stale.append(path)
        if stale:
            print(
                "Generated dashboards do not match the expected files:", file=sys.stderr
            )
            for path in stale:
                print(f"  {path}", file=sys.stderr)
            return 1
        return 0

    assert args.out_dir is not None
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for name, dashboard in dashboards.items():
        path = args.out_dir / f"{name}.json"
        path.write_text(generated_text(dashboard), encoding="utf-8")
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
