# Grafana dashboards

> **简体中文版本: [README.zh-CN.md](README.zh-CN.md)**

RL-Insight ships its Grafana dashboards as Jsonnet composition sources inside the
installed package. At startup the server stages the bundled static JSON
dashboards first and then renders those sources into the same runtime directory,
so both families are served together — and a dashboard change is a source
change: nobody has to generate and commit JSON first.

## Overview

RL-Insight renders dashboards from Jsonnet composition sources that ship inside
the installed package. Grafana itself only ever reads JSON and never Jsonnet, so
the composition sources are evaluated at startup and the result is written next
to the dashboards that already ship as JSON.

Two families of dashboards coexist in the same Grafana folder:

- the bundled **static JSON** dashboards, staged first at every start and served
  as-is: `verl_tainer_v1_with_vllm_engine.json` and
  `verl_tainer_v1_with_sglang_engine.json`;
- the **generated** compositions, rendered into that same folder as an extra set
  of dashboards: `verl_tainer_v1_with_vllm_engine_jsonnet.json` and
  `verl_tainer_v1_with_sglang_engine_jsonnet.json`.

| | |
| --- | --- |
| Source of truth | `rl_insight/config/services/grafana/jsonnet/` inside the installed package |
| Who renders it | `rl_insight/server/runtime.py` at every `rl-insight server start` |
| Jsonnet dependency | `rjsonnet`, an ordinary Python dependency — no CLI, no Go, no compiler |
| Committed static JSON | `rl_insight/config/services/grafana/dashboards/` — the officially loaded dashboards, staged first at every start; the Jsonnet render adds further dashboards beside them |

Content is split into reusable modules (panels, rows, variables for one
subsystem) and a composition registry that names which modules make up a
dashboard. The runtime merges them into complete Grafana dashboards.

```text
rl_insight/config/services/grafana/jsonnet/
├── dashboards.jsonnet                    thin entrypoint: compose every registry entry
├── dashboard_compositions.libsonnet      the single production composition registry
├── dashboards/
│   ├── trainer.libsonnet  controller.libsonnet  storage.libsonnet  trajectory.libsonnet
│   ├── vllm.libsonnet  sglang.libsonnet  npu.libsonnet
└── framework/                            generic composer + visualization defaults
    ├── composer.libsonnet
    └── viz.libsonnet
```

```text
tools/grafana/framework/
├── README.md                             this document
├── README.zh-CN.md                       simplified Chinese translation
└── generate.py                           optional thin CLI over the package renderer
```

### Jsonnet source files

| File | Purpose | Who normally changes it |
| --- | --- | --- |
| `dashboard_compositions.libsonnet` | Production registry: the `modules` of each dashboard plus its dashboard-level metadata, title, tags and ordering | Dashboard developer — the file changed most often |
| `dashboards/*.libsonnet` | The reusable panels, rows and variables of one subsystem | Whoever adds or changes that monitoring content |
| `dashboards.jsonnet` | Stable production entrypoint: imports the registry and composes every registered dashboard | Normally nobody |
| `framework/composer.libsonnet` | Generic composition semantics shared by every dashboard | Not ordinary dashboard developers |
| `framework/viz.libsonnet` | Generic visualization defaults | Only for a framework-level visualization change |

### Default startup result

With the default configuration, `rl-insight server start` stages the bundled
static dashboards first and then renders the bundled Jsonnet entrypoint into the
same `verl` folder, so four VERL dashboards are served:

```text
<runtime_dir>/dashboards/verl/
├── verl_tainer_v1_with_vllm_engine.json            bundled static JSON
├── verl_tainer_v1_with_sglang_engine.json          bundled static JSON
├── verl_tainer_v1_with_vllm_engine_jsonnet.json    rendered from Jsonnet at startup
└── verl_tainer_v1_with_sglang_engine_jsonnet.json  rendered from Jsonnet at startup
```

`<runtime_dir>` is the server runtime directory (`~/.rl-insight/runtime` by
default). The generated dashboards carry the `_jsonnet` suffix in their title
and have their own Grafana identity, so Grafana lists them as dashboards of
their own beside the static ones. The other bundled folders
(`quick_start_demo`, `agent_loop_trajectory`, `verl-omni`) keep being served
unchanged.

## Dashboard developer scenarios

Every scenario below is a change to the Jsonnet sources that ship with the
install. After the change, the normal RL-Insight startup flow materializes the
dashboard automatically — there is no manual generate step, and no JSON file to
edit or commit first.

### 1. Reuse existing modules in a new dashboard

Add one entry to `dashboard_compositions.libsonnet`; nothing else changes.

```jsonnet
{
  compositions: {
    my_verl_dashboard: {
      modules: [trainer, trajectory, npu],
      dashboard: {
        metadata: { name: 'my-verl-dashboard', labels: {}, annotations: {} },
        title: 'my_verl_dashboard',
        tags: ['RL-Insight', 'verl'],
        spec: productionSpec,
        variableOrder: ['datasource', 'project', 'experiment_name', 'npu_instance'],
        rowOrder: ['rl state timeline', 'training metric'],
      },
    },
  },
}
```

Start RL-Insight as usual; `my_verl_dashboard.json` is materialized into the
`verl` folder at startup.

### 2. Add a Foo engine or other new content

1. Add `dashboards/foo.libsonnet` with the panels, rows and variables of the new
   subsystem.
2. Import it in `dashboard_compositions.libsonnet` and register a composition:

```jsonnet
verl_tainer_v1_with_foo_engine_jsonnet: {
  modules: verlBase + [foo],
  dashboard: { ... },
},
```

The `_jsonnet` suffix is the convention the built-in compositions follow so a
generated dashboard cannot collide with a committed static one it is added
beside. A brand-new engine has no static counterpart, so any name that is not
already used works; the registry key is what becomes the output file name.

### 3. Extend an existing dashboard with a satellite module

Keep `trainer` as it is and add a satellite module next to it. `trainer_extra`
owns the extra panel and the row it is rendered in; the composition adds the
module and names the new row in `rowOrder`.

```jsonnet
// dashboards/trainer_extra.libsonnet — extra content for the trainer dashboard
{
  panels: [{
    key: 'training_extra.custom',
    outputKey: 'panel-training-extra-custom',
    id: 500,
    title: 'Custom training metric',
    queries: [{ expr: 'custom_training_metric' }],
  }],
  rows: {
    'training extra metric': {
      kind: 'RowsLayoutRow',
      spec: {
        title: 'training extra metric',
        collapse: false,
        layout: {
          kind: 'GridLayout',
          spec: {
            items: [{
              kind: 'GridLayoutItem',
              spec: {
                x: 0,
                y: 0,
                width: 24,
                height: 8,
                element: {
                  kind: 'ElementReference',
                  name: 'training_extra.custom',
                },
              },
            }],
          },
        },
      },
    },
  },
}
```

```jsonnet
// dashboard_compositions.libsonnet
local trainer_extra = import 'dashboards/trainer_extra.libsonnet';

{
  compositions: {
    verl_tainer_v1_with_vllm_engine_jsonnet: {
      modules: verlBase + [trainer_extra, vllm, npu],
      dashboard: {
        // ... unchanged dashboard-level config
        rowOrder: [
          'rl state timeline',
          'training metric',
          'vllm engine metric',
          'transfer queue metric',
          'hardware metric',
          'training extra metric',
        ],
      },
    },
  },
}
```

`rowItems` is the other additive form: it appends items to a row the composition
already renders as a `GridLayout` row, so that row does not have to be named in
`rowOrder` again. Either way an extension cannot silently override an existing
panel, row or variable — see [Framework internals](#framework-internals) for the
row-extension rules.

Start RL-Insight as usual; the extended dashboard is materialized at startup.

### 4. Change the framework itself

Only for a new visualization type or new composition behavior. The generic
assets are `framework/composer.libsonnet` (composition semantics) and
`framework/viz.libsonnet` (shared visualization defaults); every dashboard
shares them, and ordinary dashboard work never needs them. Their contract is
documented in [Framework internals](#framework-internals).

## Configuration

All three keys live under `grafana:` in the server configuration
(`rl_insight/config/config.yaml`, or your own `--config` file).

| Key | Default | Meaning |
| --- | --- | --- |
| `grafana.dashboard_config` | empty | Jsonnet composition config to render. Empty renders the entrypoint bundled in the package. |
| `grafana.dashboards_dir` | packaged `config/services/grafana/dashboards` | A static JSON directory to copy instead of rendering. |
| `grafana.extra_dashboard_dir` | unset | Extra JSON dashboards merged on top of the base source. Also settable with `--extra-dashboard-dir`. |

Precedence, applied at every start:

1. **`dashboard_config` is set** — that Jsonnet config is rendered. A missing
   file or a Jsonnet error stops startup with an error naming the config, before
   Grafana is launched.
2. **`dashboards_dir` points somewhere other than the bundled default** — that
   directory is copied as-is and no built-in Jsonnet is rendered. This is the
   legacy static workflow; a configured directory that does not exist or is not
   a directory stops startup.
3. **Otherwise** — the Jsonnet entrypoint bundled in the installed package is
   rendered.
4. **`extra_dashboard_dir` always merges last**, on top of whatever the base
   source produced: recursive copy, invalid paths rejected, and a `.json` file
   that would collide with an already staged one stops startup.

In the default case and in case 1 the bundled static dashboards are staged
first, and the rendered compositions are added into the `verl` folder alongside
them. Setting `dashboard_config` replaces only the built-in Jsonnet composition
layer: the bundled static `verl` dashboards and the other bundled folders
(`quick_start_demo`, `agent_loop_trajectory`, `verl-omni`) are still staged, so
every bundled dashboard outside that layer keeps being served, the folder layout
Grafana shows is unchanged, and whatever the configured composition produces is
added next to it. Rendering is additive — a composition whose output filename
collides with an already staged file stops startup with an error naming the
conflicting paths, and no staged dashboard is ever overwritten.

## Built-in compositions

| Module | Responsibility |
| --- | --- |
| `trainer` | Training metrics: actor, critic, reward, loss, rollout, throughput, timing |
| `controller` | Controller / orchestration / transfer-queue control metrics |
| `storage` | Partition, storage, and data-transfer metrics |
| `trajectory` | Tempo / TraceQL state timeline |
| `vllm` | vLLM inference and host-side metrics |
| `sglang` | SGLang inference metrics |
| `npu` | Ascend NPU metrics |

The shared base is `verlBase = [trainer, controller, storage, trajectory]`, and
the two registered compositions are:

```text
verl_tainer_v1_with_vllm_engine_jsonnet   = verlBase + [vllm, npu]
verl_tainer_v1_with_sglang_engine_jsonnet = verlBase + [sglang]
```

A registry key becomes both the rendered file name and, through the
composition's `title`, the dashboard title: `verl_tainer_v1_with_vllm_engine_jsonnet`
renders `verl_tainer_v1_with_vllm_engine_jsonnet.json` with the title
`verl_trainer_v1_with_vllm_engine_jsonnet`, and
`verl_tainer_v1_with_sglang_engine_jsonnet` renders
`verl_tainer_v1_with_sglang_engine_jsonnet.json` with the title
`verl_trainer_v1_with_sglang_engine_jsonnet`. The `_jsonnet` suffix appears in
the registry key on purpose: those are the names of the generated dashboards,
distinct from the committed static files they are added beside.

Each composition also declares its own `metadata.name`, different from the
static dashboard's, so Grafana sees two separate dashboards rather than two
versions of one. The SGLang composition is `verlBase + [sglang]` and deliberately
has no NPU module: the Ascend NPU panels belong to the vLLM/NPU composition, not
to an SGLang deployment.

Adding a dashboard is a registry entry; see the
[developer scenarios](#dashboard-developer-scenarios) above.

## User customization

These three keys are what a user of an installed package needs. They all live
under `grafana:` in the server configuration.

| You want | Do this |
| --- | --- |
| Extra dashboards without touching the installed package | Put the `.json` files in a directory and pass `--extra-dashboard-dir <dir>` (`grafana.extra_dashboard_dir`). It is merged on top of the base source, last. |
| A completely different Jsonnet composition | Set `grafana.dashboard_config` to your own composition config. It replaces the built-in Jsonnet composition layer and stops startup if it cannot be rendered. |
| To serve only your own static JSON | Set `grafana.dashboards_dir` to your directory; it replaces the built-in render. |

Dashboard developers are a different role: they change the Jsonnet sources in
the repository, and those sources ship with the install. An ordinary user does
not edit `site-packages`; use the three keys above instead. See
[Dashboard developer scenarios](#dashboard-developer-scenarios) for that role.

A custom `dashboard_config` is a standalone Jsonnet file. The renderer evaluates
it where it lies and adds no import path of its own, so the imports inside it
resolve relative to that file: a config that imports the packaged composer or
modules has to point at them explicitly, for example with the absolute path of
the installed package.

```jsonnet
// Use the directory reported by:
//   python -c "import rl_insight, pathlib; print(pathlib.Path(rl_insight.__file__).parent)"
local composer = import '<installed rl_insight dir>/config/services/grafana/jsonnet/framework/composer.libsonnet';
local npu = import '<installed rl_insight dir>/config/services/grafana/jsonnet/dashboards/npu.libsonnet';

{
  my_board: composer.compose([npu], {
    metadata: { name: 'my-board', labels: {}, annotations: {} },
    title: 'my_board',
    tags: ['RL-Insight'],
    spec: { cursorSync: 'Crosshair' },
    variableOrder: ['npu_instance'],
    rowOrder: [],
  }),
}
```

A relative form such as `../rl_insight/config/services/grafana/jsonnet/...` only
works while the config sits inside a source checkout; it is not a general
installed-user workflow.

Its dashboards are rendered into the same `verl` folder as the built-in
compositions.

## How it works

```text
rl-insight server start
        │
        │ PREPARES — runtime.py:prepare_files() calls _prepare_grafana_dashboards()
        ▼
<runtime_dir>/dashboards  (rebuilt from scratch on every start)
        │
        │ STATIC FIRST — the bundled dashboards directory is staged as-is,
        │ including the committed static JSON dashboards in the verl folder
        ▼
<runtime_dir>/dashboards  (bundled static dashboards in place)
        │
        │ JSONNET ALONGSIDE — the Jsonnet composition config is rendered into
        │ the same verl folder as an extra set of dashboards
        ▼
<runtime_dir>/dashboards/verl/*.json  (rendered <dashboard-name>.json files)
        │
        │ MERGED — grafana.extra_dashboard_dir is copied on top, last
        ▼
<runtime_dir>/dashboards
        │
        │ POINTED AT BY — _render_grafana_provisioning() writes
        │ provisioning/dashboards/default.yml, a file provider whose
        │ options.path is that directory with foldersFromFilesStructure
        ▼
Grafana
    loads one folder per subdirectory and displays the dashboards
```

Rendering happens in-process through `rl_insight.grafana.renderer`
(`rjsonnet.evaluate_file`); it never shells out, and the runtime only writes
under `<runtime_dir>` — the package sources, the bundled JSON and the
configuration are read-only inputs.

`<runtime_dir>` is the server runtime directory (`~/.rl-insight/runtime` by
default), and the dashboards are rebuilt on every start, so a removed source
file never leaves a stale dashboard behind.

The Jsonnet render is additive (`overwrite=False`): the bundled static
dashboards are already staged when it runs, so a composition whose output
filename collides with a staged file fails the startup with an error naming the
conflicting paths instead of overwriting a static dashboard.

## Framework internals

The framework is generic: it knows nothing about any concrete dashboard — no
engine names, no metric names, no production paths — and it ships no fixtures.
Modules and composition configs are plain data, and `composer.compose(modules,
dashboard)` turns them into one Grafana Dashboard v2 resource. The composer
contains no dashboard-specific knowledge: all content — panels, rows,
variables, and additive row extensions — comes from the modules, and all
dashboard-level decisions come from the composition config.

### Module interface

A module is a plain Jsonnet object — data only, no behavioral code:

| field | required | content |
| ----------- | -------- | ---------------------------------------------------------------- |
| `panels` | yes | list of panel records: `key`, `outputKey`, `id`, `title`, `queries`, plus optional `description`, `links`, `vizBase`, `vizPatch`, `transformations`, `queryOptions` |
| `rows` | no | named `RowsLayoutRow` specs the module **owns** (creates); grid items reference panels by their `key` |
| `rowItems` | no | `{ <existing row name>: [GridLayoutItem, ...] }` — items **appended** to a row owned by another (or the same) module; the module does not create the row |
| `variables` | no | named variable specs |
| `tags` | no | tags merged into the dashboard tag list |

`vizPatch` is an RFC 7396 merge patch over the shared defaults in
`viz.libsonnet`, so a module only describes what differs from the defaults.

### Composition rules

1. **Content is concatenated in module order**; nothing is overridden
   implicitly.
2. **Conflicts are errors, not overrides**: duplicate panel `key`, `outputKey`,
   or `id`, duplicate owned row name, or duplicate variable name across the
   composed modules all abort evaluation with a message naming the offending
   entries.
3. **Dashboard-level decisions come from the composition config**: `metadata`,
   `title`, `spec` (chrome such as time range/refresh), `tags`, and the
   `variableOrder` / `rowOrder` that pick and order variables and rows from the
   merged modules.
4. **Ordering references are validated**: an entry in `variableOrder` or
   `rowOrder` that no module provides aborts evaluation.
5. **Tags** are the config's tags followed by module tags in composition order,
   de-duplicated keeping the first occurrence.
6. **References resolve late**: layouts address panels by module-unique `key`;
   the composer rewrites `ElementReference` names to `outputKey`s when
   rendering, so modules never need to know each other's naming.
7. **`rowItems` are append-only extensions** of existing rows: appending runs in
   module composition order (and, per target row, in the order the modules are
   listed); a target row that no module owns fails with
   `unknown row extension target: ...`; a target that is not a `RowsLayoutRow`
   with a `GridLayout` layout carrying `spec.items` fails with
   `unsupported row extension target: ...` — never silently ignored.

### Row extension example

A base module owns its rows; extension modules contribute panels into those rows
via `rowItems`. Both files stay generic — this example uses an `overview` row
and an `overview_extra` satellite module:

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
local composer = import 'rl_insight/config/services/grafana/jsonnet/framework/composer.libsonnet';
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
composition order — and adding another panel to an existing dashboard is a new
extension module plus one entry in the config's module list, never a change to
the base module.

### Renderer

The core API lives in `rl_insight.grafana.renderer` (also re-exported from
`rl_insight.grafana`):

| function | purpose |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `render_dashboards(config) -> dict` | evaluate the config and return `{ "<dashboard-name>": <dashboard> }` |
| `generated_text(dashboard) -> str` | deterministic serialization of one dashboard |
| `materialize_dashboards(config, output_dir)` | render and write one `<dashboard-name>.json` per dashboard |
| `stale_dashboards(config, expected_dir)` | the expected files that are missing or differ byte-for-byte |
| `FRAMEWORK_DIR` | package path holding `composer.libsonnet` and `viz.libsonnet` |
| `JsonnetRenderError` | raised when a config is missing, fails to evaluate or does not produce a non-empty object of dashboards; its message names the config path and keeps the Jsonnet stack trace |

```python
from rl_insight.grafana import renderer

dashboards = renderer.render_dashboards("dashboards/my-service.jsonnet")
renderer.materialize_dashboards("dashboards/my-service.jsonnet", "/tmp/out")
assert renderer.stale_dashboards("dashboards/my-service.jsonnet", "dashboards/expected") == []
```

A composition config evaluates to `{ "<dashboard-name>": <dashboard resource> }`
where each resource is the object returned by `composer.compose(...)`; the
renderer writes one JSON file per name.

### Additive rendering and determinism

`materialize_dashboards(..., overwrite=False)` is how the runtime renders: every
target path is computed up front and, if any of them already exists, nothing at
all is written and `JsonnetRenderError` names the conflicting paths. The check
happens before the first write, so a collision never leaves a partially
materialized set behind — startup either succeeds with all dashboards or fails
without touching any.

Output is deterministic: the composer emits object fields in sorted order and
`generated_text` uses fixed indentation, so re-running over unchanged sources is
byte-identical.

Evaluation happens **in-process** through the [`rjsonnet`](https://pypi.org/project/rjsonnet/)
binding, a base runtime dependency of `rl-insight`. `rjsonnet` publishes CPython
ABI3 wheels for Windows (x86/x64), macOS (x86_64/arm64/universal2) and the
common Linux glibc/musl architectures, so installing `rl-insight` is enough on
every platform: no `jsonnet` CLI, no `go install`, and no compiler step.

### Where the framework lives

The runtime pieces live inside the installed `rl_insight` package, so a wheel
carries everything needed to render — no Jsonnet CLI, no Go toolchain, no
compiler, and no second copy of the framework:

```text
rl_insight/grafana/renderer.py                 runtime core: evaluate + serialize
rl_insight/config/services/grafana/jsonnet/framework/
├── composer.libsonnet   panel/row/variable machinery + compose()
└── viz.libsonnet        shared Grafana visualization defaults
tools/grafana/framework/generate.py            optional thin CLI over the package core
tests/monitor/ut/test_grafana_framework.py     generic framework contract tests
```

`rl_insight.grafana.renderer` is the single implementation of evaluation and
serialization. `FRAMEWORK_DIR` points at the packaged `composer.libsonnet` and
`viz.libsonnet`, so composition configs import the composer from there and the
library, the runtime and the optional CLI share exactly one source of truth.

## Optional CLI

`tools/grafana/framework/generate.py` is the only CLI around the framework. It
is a thin wrapper over the package renderer: it parses arguments, calls the
renderer and maps the result to an exit code, and renders exactly the bytes
`render_dashboards` / `materialize_dashboards` produce. It never re-implements
the evaluator, never shells out to a Jsonnet CLI, and never invokes another
Python entry point.

```bash
# render: writes <dashboard-name>.json into the output directory
python tools/grafana/framework/generate.py \
  --config dashboards/my-service.jsonnet --out-dir /tmp/out

# verify: compare against expected files, exit 1 on any mismatch
python tools/grafana/framework/generate.py \
  --config dashboards/my-service.jsonnet \
  --check --expected-dir dashboards/expected
```

Exit codes: `0` success, `1` `--check` found stale files, `2` the config could
not be rendered.

The CLI is optional. Normal users and dashboard developers never need it — the
runtime renders the dashboards at startup — and nothing in the runtime path calls
it or depends on it.

## Testing

- `tests/monitor/ut/test_grafana_framework.py` — the generic framework contract.
  It renders minimal composition configs built in temporary directories and
  covers composition semantics and the conflict rules, `rowItems` extensions,
  rendering and byte determinism, the `overwrite=False` preflight, collision
  atomicity, the packaged `.libsonnet` assets, the absence of any
  subprocess/CLI dependency, and the thinness of the optional CLI (same bytes,
  same exit codes).
- `tests/monitor/ut/test_grafana_dashboards.py` — RL-Insight runtime
  integration: automatic generation at startup without any CLI, the static
  dashboard files kept byte-identical, the generated dashboards having their own
  identity, the other bundled dashboards still served, `dashboard_config`
  acceptance and rejection, the runtime directory being rebuilt, and
  extra/legacy/collision/stale handling.
- `pre-commit run --all-files` covers license headers, formatting, and compile
  checks.

## Limitations

- Composition is additive only; implicit panel/row/variable overrides are not
  supported. To change an existing panel, edit the module that owns it.
- `rowItems` only appends `GridLayoutItem`s to a `GridLayout` row; it cannot
  remove or reorder existing items, and rows with a non-GridLayout layout cannot
  be extended.
- A custom `dashboard_config` is a standalone Jsonnet file: it has to import the
  packaged composer and modules by explicit path, and cannot rely on the package
  being added to any import path.
- A dashboard source change is materialized at startup, so a Jsonnet error
  surfaces as a failed `rl-insight server start` rather than as a missing
  dashboard in Grafana.
- The bundled static JSON dashboards are a packaged artifact served as-is: they
  must not be hand-edited, and the Jsonnet sources are the thing to change.
