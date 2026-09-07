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

"""Regression tests for dashboard-as-code generation."""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from tools.grafana.generate_dashboards import (
    COMMON_MODULES,
    ENGINES,
    build_dashboard,
    load_sources,
    render_dashboards,
    validate_modules,
)


def _element_references(value: Any) -> list[str]:
    references: list[str] = []
    if isinstance(value, dict):
        if value.get("kind") == "ElementReference":
            references.append(value["name"])
        for child in value.values():
            references.extend(_element_references(child))
    elif isinstance(value, list):
        for child in value:
            references.extend(_element_references(child))
    return references


def test_generated_dashboards_are_current() -> None:
    for path, expected in render_dashboards().items():
        assert path.read_text(encoding="utf-8") == expected


def test_generation_is_deterministic_and_does_not_mutate_sources() -> None:
    manifest, common, engines = load_sources()
    original_sources = deepcopy((manifest, common, engines))

    first = {
        engine: build_dashboard(engine, manifest, common, engines) for engine in ENGINES
    }
    second = {
        engine: build_dashboard(engine, manifest, common, engines) for engine in ENGINES
    }

    assert first == second
    assert (manifest, common, engines) == original_sources


def test_dashboards_use_valid_semantic_element_keys() -> None:
    for engine in ENGINES:
        dashboard = build_dashboard(engine)
        elements = dashboard["spec"]["elements"]
        references = _element_references(dashboard["spec"]["layout"])

        assert set(references) == set(elements)
        assert len(references) == len(set(references))
        assert not any(re.fullmatch(r"panel-\d+", key) for key in elements)


def test_common_modules_are_reused_without_duplicate_definitions() -> None:
    _, common, engines = load_sources()
    for engine in ENGINES:
        selected = {**common, engine: engines[engine]}
        validate_modules(selected)
        dashboard_elements = build_dashboard(engine)["spec"]["elements"]
        for module_name in COMMON_MODULES:
            for key, element in common[module_name]["elements"].items():
                assert dashboard_elements[key] == element
