# Grafana dashboard composition framework

A minimal, generic framework for building Grafana dashboards as Jsonnet code:
a **composer** that combines small dashboard modules into one dashboard, and a
**generator** that renders the result to deterministic JSON. The framework
knows nothing about any concrete dashboard (no engine names, no metric names,
no production paths) and ships no fixtures — everything below is exercised by
tests that build their inputs in temporary directories.

## What problem does this solve?

The current production dashboards under
`rl_insight/config/services/grafana/dashboards/verl/` duplicate the same
panel/row/variable definitions across per-engine variants — 116 panels are
duplicated verbatim between the vLLM and SGLang dashboards. Every tweak has to
be repeated by hand, variants are hard to extend, and the generated JSON cannot
be checked mechanically. This framework addresses all three: modules define
content once, composition configs decide which modules make up a dashboard,
and `--check` mode fails deterministically when the committed JSON no longer
matches the sources.

## Layout

```
tools/grafana/framework/
├── composer.libsonnet   # panel/row/variable machinery + compose()
├── viz.libsonnet        # shared Grafana visualization defaults
├── generate.py          # CLI: --config/--out-dir/--check
└── README.md
tests/monitor/ut/test_grafana_framework.py
```

## Module interface

A module is a plain Jsonnet object — data only, no behavioral code:

| field       | required | content                                                          |
| ----------- | -------- | ---------------------------------------------------------------- |
| `panels`    | yes      | list of panel records: `key`, `outputKey`, `id`, `title`, `queries`, plus optional `description`, `links`, `vizBase`, `vizPatch`, `transformations`, `queryOptions` |
| `rows`      | no       | named `RowsLayoutRow` specs; grid items reference panels by their `key` |
| `variables` | no       | named variable specs                                             |
| `tags`      | no       | tags merged into the dashboard tag list                          |

`vizPatch` is an RFC 7396 merge patch over the shared defaults in
`viz.libsonnet`, so a module only describes what differs from the defaults.

## Composition rules (all explicit)

1. **Content is concatenated in module order**; nothing is overridden
   implicitly.
2. **Conflicts are errors, not overrides**: duplicate panel `key`,
   `outputKey`, or `id`, duplicate row name, or duplicate variable name across
   the composed modules all abort evaluation with a message naming the
   offending entries.
3. **Dashboard-level decisions come from the composition config**: `metadata`,
   `title`, `spec` (chrome such as time range/refresh), `tags`, and the
   `variableOrder` / `rowOrder` that pick and order variables and rows from the
   merged modules.
4. **Ordering references are validated**: an entry in `variableOrder` or
   `rowOrder` that no module provides aborts evaluation.
5. **Tags** are the config's tags followed by module tags in composition
   order, de-duplicated keeping the first occurrence.
6. **References resolve late**: layouts address panels by module-unique `key`;
   the composer rewrites `ElementReference` names to `outputKey`s when
   rendering, so modules never need to know each other's naming.

## Minimal example

One module (excerpt) and one composition config; the same shape scales to any
number of modules such as `overview`, `latency`, `capacity` and `errors`:

```jsonnet
// modules/overview.libsonnet
{
  panels: [{
    key: 'overview.requests', outputKey: 'overview-requests', id: 1,
    title: 'Request rate',
    queries: [{ expr: 'my_service_requests_total' }],
  }],
  rows: {
    overview: {
      kind: 'RowsLayoutRow',
      spec: {
        title: 'Overview', collapse: false,
        layout: {
          kind: 'GridLayout',
          spec: {
            items: [{
              kind: 'GridLayoutItem',
              spec: {
                x: 0, y: 0, width: 12, height: 8,
                element: { kind: 'ElementReference', name: 'overview.requests' },
              },
            }],
          },
        },
      },
    },
  },
}

// dashboards/my-service.jsonnet
local composer = import 'tools/grafana/framework/composer.libsonnet';
local overview = import 'modules/overview.libsonnet';
local latency = import 'modules/latency.libsonnet';

{
  'my-service': composer.compose([overview, latency], {
    metadata: { name: 'my-service', uid: 'my-service' },
    title: 'My service',
    tags: ['example'],
    spec: { time: { from: 'now-6h', to: 'now' } },
    variableOrder: ['region'],
    rowOrder: ['overview', 'latency'],
  }),
}
```

Composing the same `overview` module with `capacity` and `errors` instead —
or reordering rows — is a change to the composition config only, never to the
modules.

## Generator

```bash
# render: writes <dashboard-name>.json into the output directory
python tools/grafana/framework/generate.py \
  --config dashboards/my-service.jsonnet --out-dir /tmp/out

# verify: compare against committed expected files, exit 1 on any mismatch
python tools/grafana/framework/generate.py \
  --config dashboards/my-service.jsonnet \
  --check --expected-dir dashboards/expected
```

A composition config evaluates to `{ "<dashboard-name>": <dashboard resource> }`
where each resource is the object returned by `composer.compose(...)`; the
generator writes one JSON file per name. Output is deterministic: go-jsonnet
emits object fields in sorted order and the writer uses fixed indentation, so
re-running over unchanged sources is byte-identical. The generator depends on
the `gojsonnet` Python binding (0.22.0) — the Jsonnet evaluation engine —
which is added to the `[test]` extra in `pyproject.toml` (the only
modification of an existing file in this change; CI already installs
`-e ".[test]"`, so the dependency flows through without workflow edits).

## Testing

- `pytest tests/monitor/ut/test_grafana_framework.py` — 13 tests covering byte
  determinism, check-mode pass/stale-detection, every composition and conflict
  rule (duplicate panel `key`/`outputKey`/`id`, duplicate row/variable names,
  unresolved `variableOrder`/`rowOrder` entries), cross-module reference
  resolution, and composition-order/variable-order semantics. All tests build
  their Jsonnet inputs and expected outputs in `tmp_path`; no fixture JSON is
  committed.
- The existing suite keeps running unchanged: this change does not touch any
  production dashboard, the production generator, or the workflow files. The
  test path (`tests/monitor/ut/**`) is already picked up by
  `monitor_unit_test.yml`, so CI runs the framework tests with no workflow
  changes.
- `pre-commit run --all-files` covers license headers, formatting, and compile
  checks for the new files.

## Going forward: production migration

The production dashboards are migrated to this framework in a follow-up PR
(#173): the current `common`/`vllm`/`sglang` Jsonnet sources are re-expressed
as modules (trainer / controller / storage / trajectory, plus the
vLLM-, SGLang- and NPU-specific parts), the production composition configs
list those modules, and the generated JSON is kept equivalent to today's
artifacts — any intentional difference listed separately in that PR. Until
that migration lands, nothing in `rl_insight/config/services/grafana/` changes.

**Reusing the verl trainer dashboards**: the trainer panels become one more
module (`trainer.libsonnet`) extracted from the existing dashboard JSON with
the same module schema — no framework changes are needed, that is the point of
keeping the composer generic. Composing a new dashboard from the trainer plus
any engine module then means writing a small composition config that lists the
modules and picks the variable/row order. The additional development work is
limited to authoring the module files (mechanical extraction plus review),
comparable to the per-engine module split already planned in #173.

**Adding a new dashboard or module**: write the module (or reuse existing
ones), list it in a composition config, render with the generator, and commit
the JSON next to an update to the expected files. Tests will reject duplicate
names, unresolved ordering references, and any non-deterministic output.
