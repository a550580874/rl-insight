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

"""Migration-only static-vs-Jsonnet dashboard equivalence check.

Archive material for issue #156 (fork-only branch
``archive/grafana-jsonnet-migration-validation-156``). The Jsonnet split of the
Grafana dashboards (PR #173/#174) had to be *provably* semantics-preserving, so
this test renders the packaged Jsonnet entrypoint and compares the vLLM and
SGLang results against the static JSON baseline that shipped before the split.

Only the two identity fields are normalized away — ``metadata.name`` and
``spec.title`` — because the Jsonnet dashboards are separate Grafana resources
that must keep their own identity in the same folder. Every other field
(panels, queries, rows, layout, variables, chrome, tags, ordering) is compared
in full, so any migration drift fails here.

Run from a source checkout with the package dependencies installed::

    pytest tests/migration/grafana_jsonnet/test_dashboard_equivalence.py
"""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest

from rl_insight.grafana import renderer
from rl_insight.utils.constants import MonitorPaths

#: Folder holding the committed static JSON the Jsonnet split migrated from.
STATIC_DASHBOARDS_DIR = MonitorPaths.GRAFANA_DASHBOARDS_DIR / "verl"

#: ``(static name, Jsonnet composition name)`` pairs the migration must preserve.
DASHBOARD_PAIRS = (
    ("verl_tainer_v1_with_vllm_engine", "verl_tainer_v1_with_vllm_engine_jsonnet"),
    ("verl_tainer_v1_with_sglang_engine", "verl_tainer_v1_with_sglang_engine_jsonnet"),
)


def _without_identity(dashboard: dict[str, Any]) -> dict[str, Any]:
    """Blank the only two fields a migrated dashboard is allowed to change."""
    normalized = copy.deepcopy(dashboard)
    normalized["metadata"]["name"] = None
    normalized["spec"]["title"] = None
    return normalized


def _static_dashboard(name: str) -> dict[str, Any]:
    """Load one committed static dashboard (the pre-migration baseline)."""
    path = STATIC_DASHBOARDS_DIR / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def rendered_dashboards() -> dict[str, Any]:
    """Render the packaged Jsonnet entrypoint once for the whole module."""
    return renderer.render_dashboards(MonitorPaths.GRAFANA_JSONNET_ENTRYPOINT)


@pytest.mark.parametrize(("static_name", "jsonnet_name"), DASHBOARD_PAIRS)
def test_static_and_jsonnet_dashboards_hold_the_same_identity_fields(
    rendered_dashboards: dict[str, Any],
    static_name: str,
    jsonnet_name: str,
) -> None:
    """The migrated dashboard keeps its own name/title, next to the static one."""
    assert jsonnet_name in rendered_dashboards, (
        f"{jsonnet_name} is not part of the packaged Jsonnet entrypoint"
    )

    static = _static_dashboard(static_name)
    rendered = rendered_dashboards[jsonnet_name]

    assert rendered["metadata"]["name"] != static["metadata"]["name"]
    assert rendered["spec"]["title"] == f"{static['spec']['title']}_jsonnet"


@pytest.mark.parametrize(("static_name", "jsonnet_name"), DASHBOARD_PAIRS)
def test_static_and_jsonnet_dashboards_are_semantically_equivalent(
    rendered_dashboards: dict[str, Any],
    static_name: str,
    jsonnet_name: str,
) -> None:
    """Full-object comparison with only the identity fields normalized."""
    static = _without_identity(_static_dashboard(static_name))
    rendered = _without_identity(rendered_dashboards[jsonnet_name])

    assert rendered == static, (
        f"{jsonnet_name} drifted from the static baseline {static_name}"
    )


@pytest.mark.parametrize(("static_name", "jsonnet_name"), DASHBOARD_PAIRS)
def test_static_and_jsonnet_dashboards_keep_the_same_panels_rows_and_variables(
    rendered_dashboards: dict[str, Any],
    static_name: str,
    jsonnet_name: str,
) -> None:
    """Explicit content checks, so a drift failure names the affected layer."""
    static = _static_dashboard(static_name)
    rendered = rendered_dashboards[jsonnet_name]

    for field in ("panels", "rows", "variables"):
        if field not in static:
            assert field not in rendered, f"{field} was added by the migration"
            continue
        assert rendered[field] == static[field], f"{field} changed during the migration"
