# Grafana dashboard composition framework

A minimal, generic framework for building Grafana dashboards as Jsonnet code:
a **composer** that combines small dashboard modules into one dashboard, and a
**generator** that renders the result to deterministic JSON. The framework
knows nothing about any concrete dashboard (no engine names, no metric names,
no production paths) and ships no fixtures — every behavior below is exercised
by tests that build their inputs in temporary directories.

## Motivation

The current production dashboards under
`rl_insight/config/services/grafana/dashboards/verl/` duplicate the same
panel/row/variable definitions across per-engine variants — 116 panels are
duplicated verbatim between the vLLM and SGLang dashboards. Every tweak has to
be repeated by hand, variants are hard to extend, and the generated JSON cannot
be checked mechanically. This framework addresses all three: modules define
content once, composition configs decide which modules make up a dashboard,
additive extensions enrich existing rows without forking them, and `--check`
mode fails deterministically when the committed JSON no longer matches the
sources.

## Architecture

```
tools/grafana/framework/
├── composer.libsonnet   # panel/row/variable machinery + compose()
├── viz.libsonnet        # shared Grafana visualization defaults
├── generate.py          # CLI: --config/--out-dir/--check
└── README.md
tests/monitor/ut/test_grafana_framework.py
```

Modules and composition configs are plain data; `composer.compose(modules,
dashboard)` renders one Grafana Dashboard v2 resource. The composer contains
no dashboard-specific knowledge: all content — panels, rows, variables, and
additive row extensions — comes from the modules, and all dashboard-level
decisions come from the composition config.

## Module interface

A module is a plain Jsonnet object — data only, no behavioral code:

| field       | required | content                                                          |
| ----------- | -------- | ---------------------------------------------------------------- |
| `panels`    | yes      | list of panel records: `key`, `outputKey`, `id`, `title`, `queries`, plus optional `description`, `links`, `vizBase`, `vizPatch`, `transformations`, `queryOptions` |
| `rows`      | no       | named `RowsLayoutRow` specs the module **owns** (creates); grid items reference panels by their `key` |
| `rowItems`  | no       | `{ <existing row name>: [GridLayoutItem, ...] }` — items **appended** to a row owned by another (or the same) module; the module does not create the row |
| `variables` | no       | named variable specs                                             |
| `tags`      | no       | tags merged into the dashboard tag list                          |

`vizPatch` is an RFC 7396 merge patch over the shared defaults in
`viz.libsonnet`, so a module only describes what differs from the defaults.

## Composition

1. **Content is concatenated in module order**; nothing is overridden
   implicitly.
2. **Conflicts are errors, not overrides**: duplicate panel `key`,
   `outputKey`, or `id`, duplicate owned row name, or duplicate variable name
   across the composed modules all abort evaluation with a message naming the
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
7. **`rowItems` are append-only extensions** of existing rows: appending runs
   in module composition order (and, per target row, in the order the modules
   are listed); a target row that no module owns fails with
   `unknown row extension target: ...`; a target that is not a
   `RowsLayoutRow` with a `GridLayout` layout carrying `spec.items` fails with
   `unsupported row extension target: ...` — never silently ignored.

## Extending existing modules

A base module owns its rows; extension modules contribute panels into those
rows via `rowItems`. Both files stay generic — this example uses an
`overview` row and an `overview_extra` satellite module:

```jsonnet
// modules/overview.libsonnet (base: owns the row)
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

// modules/overview_extra.libsonnet (additive extension: owns no rows)
{
  panels: [{
    key: 'overview_extra.saturation', outputKey: 'overview-extra-saturation', id: 2,
    title: 'Saturation',
    queries: [{ expr: 'my_service_saturation_ratio' }],
  }],
  rowItems: {
    overview: [{
      kind: 'GridLayoutItem',
      spec: {
        x: 12, y: 0, width: 12, height: 8,
        element: { kind: 'ElementReference', name: 'overview_extra.saturation' },
      },
    }],
  },
}

// dashboards/my-service.jsonnet
local composer = import 'tools/grafana/framework/composer.libsonnet';
local overview = import 'modules/overview.libsonnet';
local overview_extra = import 'modules/overview_extra.libsonnet';

{
  'my-service': composer.compose([overview, overview_extra], {
    metadata: { name: 'my-service', uid: 'my-service' },
    title: 'My service',
    tags: ['example'],
    spec: { time: { from: 'now-6h', to: 'now' } },
    variableOrder: ['region'],
    rowOrder: ['overview'],
  }),
}
```

The rendered `Overview` row contains the base item first, then the extension's
item. Several extensions may target the same row — their items append in
composition order — and adding another panel to an existing dashboard is a
new extension module plus one entry in the config's module list, never a
change to the base module.

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
re-running over unchanged sources is byte-identical. The generator uses the
`gojsonnet` Python binding (0.22.0, the go-jsonnet evaluation engine) when it
is importable and otherwise falls back to the same engine's `jsonnet` CLI.
That fallback matters on Windows, where gojsonnet publishes no wheels: the
test extra marks the binding `platform_system != 'Windows'`, and the monitor
unit-test workflow installs the CLI via
`go install github.com/google/go-jsonnet/cmd/jsonnet@v0.22.0` instead, so the
framework tests run with the same engine version and identical output on every
platform. Both paths come together through `pyproject.toml` and the monitor
unit-test workflow (the only modifications of existing files in this change).

## Developer workflow

1. Write (or reuse) modules; decide which module owns each row.
2. List the modules in a composition config and pick `variableOrder` /
   `rowOrder` there.
3. Render with the generator and commit the JSON next to the config.
4. Keep expected files in sync with sources — CI's `--check` run fails on any
   drift, and the tests reject duplicate names, unresolved ordering
   references, bad extension targets, and non-deterministic output.

## Testing

- `pytest tests/monitor/ut/test_grafana_framework.py` — 17 tests covering byte
  determinism, check-mode pass/stale-detection, every composition and conflict
  rule (duplicate panel `key`/`outputKey`/`id`, duplicate owned row/variable
  names, unresolved `variableOrder`/`rowOrder` entries), cross-module
  reference resolution, composition-order/variable-order semantics, and the
  `rowItems` extension rules (single extension, multiple extensions in
  composition order, unknown target, non-GridLayout target, panels +
  `rowItems` without owned rows). All tests build their Jsonnet inputs and
  expected outputs in `tmp_path`; no fixture JSON is committed.
- The existing suite keeps running unchanged: this change does not touch any
  production dashboard or the production generator. CI picks the tests up via
  the `tests/monitor/ut/**` path filter in `monitor_unit_test.yml`, which
  gains one Windows-only step installing the `jsonnet` CLI (gojsonnet ships
  no Windows wheels; see Generator).
- `pre-commit run --all-files` covers license headers, formatting, and compile
  checks.

## Limitations

- `rowItems` only appends `GridLayoutItem`s to a `GridLayout` row; it cannot
  remove or reorder existing items, and rows with a non-GridLayout layout
  cannot be extended.
- There is no panel patching, inheritance, or conditional composition by
  design; modules stay plain data and the composer stays small.
- `--check` compares files byte-for-byte, so expected files must be
  regenerated on any source change.

## Going forward

The production dashboards are migrated to this framework in a follow-up PR
(#173): the current `common`/`vllm`/`sglang` Jsonnet sources are re-expressed
as modules, the production composition configs list those modules, and the
generated JSON is kept equivalent to today's artifacts — any intentional
difference listed separately in that PR. Until that migration lands, nothing
in `rl_insight/config/services/grafana/` changes.

**Reusing the verl trainer dashboards**: the trainer panels become one more
module extracted from the existing dashboard JSON with the same module schema —
no framework changes are needed, that is the point of keeping the composer
generic. Composing a new dashboard from the trainer plus any engine module
then means writing a small composition config that lists the modules and picks
the variable/row order. The additional development work is limited to
authoring the module files (mechanical extraction plus review), comparable to
the per-engine module split already planned in #173.
