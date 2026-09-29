# Grafana Jsonnet migration archive (issue #156)

This directory is **fork-only archive material**, not upstream production code.

It preserves the one-off verification assets of the Grafana dashboard Jsonnet
migration (issue #156, upstream PRs
[#174](https://github.com/verl-project/rl-insight/pull/174) and
[#173](https://github.com/verl-project/rl-insight/pull/173)). Those assets are
deliberately *not* part of the long-term upstream tree, the installed wheel or
the canonical documentation: the upstream tree keeps only the code, tests and
docs that the feature needs to run in production, while everything that only
proved *this* migration was correct lives here.

The branch also merges both migration heads, so the archived checks can run
end to end from a single checkout.

## Contents

| Path | What it is |
| --- | --- |
| `verify_modules.jsonnet` | Structural verification of the production modules and the composition registry: shared panel count, vLLM/NPU count, SGLang count, aggregate composition counts, and content fingerprints of panels, rows and variables. Moved here from `rl_insight/config/services/grafana/jsonnet/dashboards/verify_modules.jsonnet`. |
| `generate_dashboards.py` | Copy of the migration-era production generate helper (`tools/grafana/generate_dashboards.py`): renders the composition entrypoint and can semantically `--check` the committed JSON baseline. Upstream now keeps only `tools/grafana/framework/generate.py`. |
| `tests/migration/grafana_jsonnet/test_dashboard_equivalence.py` | Static-vs-Jsonnet equivalence test: vLLM and SGLang, full-object comparison with only `metadata.name` and `spec.title` normalized. Extracted from `tests/monitor/ut/test_grafana_dashboards.py`, where the one-off migration assertion used to live. |

## How to run

Everything here runs from a source checkout (the archived Jsonnet imports use
checkout-relative paths) and needs the package dependencies, including
`rjsonnet`:

```bash
# 1. Semantic equivalence: static JSON baseline vs Jsonnet composition.
pytest tests/migration/grafana_jsonnet/test_dashboard_equivalence.py

# 2. Structural verification of the modules and the registry.
python -c "import rjsonnet; rjsonnet.evaluate_file('tools/grafana/migration/verify_modules.jsonnet')"

# 3. Migration baseline helper: materialize the Jsonnet dashboards into a
#    scratch directory, then verify the rendering is reproducible (no drift).
python tools/grafana/migration/generate_dashboards.py --out-dir /tmp/rl-insight-migration-baseline
python tools/grafana/migration/generate_dashboards.py --check --out-dir /tmp/rl-insight-migration-baseline
```

The `_jsonnet` dashboards are generated at startup and are never committed, so
the helper is pointed at an explicit scratch `--out-dir` here; its default
`--out-dir` is the committed static folder, which only ever holds the two
pre-migration static dashboards.

`verify_modules.jsonnet` fails evaluation with a named assertion (for example
`shared panel count changed` or `vLLM composition panel content changed`) as
soon as the migrated modules drift from the values recorded during the
migration, and otherwise prints the per-module and per-composition counts.

`generate_dashboards.py --check` compares parsed JSON objects, so it reports
semantic drift rather than serialization-only key-order differences.

## What must not happen here

- No pull request into `verl-project/rl-insight` is opened from this branch.
- Nothing in this directory may be referenced by the upstream tree, the wheel
  or `tools/grafana/framework/README*.md`.
