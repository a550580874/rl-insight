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

"""Migration-archive CLI for the production Grafana dashboard compositions.

Archived copy of the ``tools/grafana/generate_dashboards.py`` helper that
issue #156 (PR #173/#174) used for migration-baseline generation, semantic
``--check`` and debugging. It is fork-only archive material: the long-term
upstream tree keeps only the single optional CLI
``tools/grafana/framework/generate.py``, and the runtime renders through
``rl_insight.grafana.renderer`` directly.

Optional CLI for the production Grafana dashboard compositions.

Normal use never needs this command. At startup
``rl_insight.server.runtime`` renders the Jsonnet entrypoint bundled in the
installed package, so a user or a dashboard developer only edits the package
sources — nothing has to be generated and committed first.

The CLI stays for internal/debug/CI work: refreshing the committed JSON
baseline (kept only as a semantic reference) and verifying that this baseline
still matches the Jsonnet sources.

Evaluation and serialization are not implemented here — they come from
:mod:`rl_insight.grafana.renderer`, the same core the runtime uses, so the CLI
and the runtime can never disagree. ``--check`` compares parsed JSON objects,
so serialization-only key-order differences never mask or fake content drift.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
if (_REPO_ROOT / "rl_insight").is_dir() and str(_REPO_ROOT) not in sys.path:
    # Running straight from a source checkout without an installed package.
    sys.path.insert(0, str(_REPO_ROOT))

from rl_insight.grafana.renderer import (  # noqa: E402
    JsonnetRenderError,
    generated_text,
    render_dashboards,
)
from rl_insight.utils.constants import MonitorPaths  # noqa: E402

DEFAULT_CONFIG = MonitorPaths.GRAFANA_JSONNET_ENTRYPOINT
DEFAULT_OUT_DIR = MonitorPaths.GRAFANA_JSONNET_OUTPUT_DIR


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help="composition entrypoint (.jsonnet, default: %(default)s)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help="directory holding <composition-name>.json (default: %(default)s)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="compare rendered dashboards against the committed files (exit 1 on drift)",
    )
    args = parser.parse_args()

    try:
        dashboards = render_dashboards(args.config)
    except JsonnetRenderError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if args.check:
        drifted: list[str] = []
        for name, dashboard in dashboards.items():
            path = args.out_dir / f"{name}.json"
            committed = (
                json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
            )
            if committed != dashboard:
                drifted.append(f"{path} (semantic drift)")
        if drifted:
            print(
                "Rendered dashboards do not match the committed files:",
                file=sys.stderr,
            )
            for path in drifted:
                print(f"  {path}", file=sys.stderr)
            return 1
        return 0

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for name, dashboard in dashboards.items():
        path = args.out_dir / f"{name}.json"
        path.write_text(generated_text(dashboard), encoding="utf-8")
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
