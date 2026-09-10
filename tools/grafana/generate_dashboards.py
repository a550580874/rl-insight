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

"""Generate the checked-in Grafana dashboards from their Jsonnet sources."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
ENTRYPOINT = ROOT / "tools/grafana/dashboards.jsonnet"
DASHBOARD_DIR = ROOT / "rl_insight/config/services/grafana/dashboards/verl"
OUTPUTS = {
    "vllm": DASHBOARD_DIR / "verl_tainer_v1_with_vllm_engine.json",
    "sglang": DASHBOARD_DIR / "verl_tainer_v1_with_sglang_engine.json",
}


def render_sources() -> dict[str, Any]:
    """Evaluate the Jsonnet entry point and return both dashboards."""
    jsonnet = shutil.which("jsonnet")
    if jsonnet is None:
        raise RuntimeError(
            "jsonnet was not found; install go-jsonnet v0.22.0 or newer first"
        )
    completed = subprocess.run(
        [jsonnet, str(ENTRYPOINT)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def preserve_order(value: Any, template: Any) -> Any:
    """Use the checked-in artifact's key order to keep generated diffs focused."""
    if isinstance(value, dict) and isinstance(template, dict):
        ordered = {
            key: preserve_order(value[key], template[key])
            for key in template
            if key in value
        }
        ordered.update((key, value[key]) for key in value if key not in template)
        return ordered
    if isinstance(value, list) and isinstance(template, list):
        return [
            preserve_order(item, template[index]) if index < len(template) else item
            for index, item in enumerate(value)
        ]
    return value


def generated_text(value: Any, path: Path) -> str:
    template = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    ordered = preserve_order(value, template)
    return json.dumps(ordered, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if checked-in dashboards do not match the Jsonnet sources",
    )
    args = parser.parse_args()

    try:
        dashboards = render_sources()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    stale: list[Path] = []
    for engine, path in OUTPUTS.items():
        text = generated_text(dashboards[engine], path)
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(path)
        else:
            path.write_text(text, encoding="utf-8")
            print(path.relative_to(ROOT))

    if stale:
        print("Generated Grafana dashboards are out of date:", file=sys.stderr)
        for path in stale:
            print(f"  {path.relative_to(ROOT)}", file=sys.stderr)
        print("Run tools/grafana/generate_dashboards.py", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
