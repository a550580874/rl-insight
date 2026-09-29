# Grafana dashboards

> **简体中文版本: [README.zh-CN.md](README.zh-CN.md)**

RL-Insight ships its Grafana dashboards as Jsonnet composition sources inside the
installed package. At startup the server renders them into the runtime directory
and points Grafana provisioning at the result, so a dashboard change is a source
change — nobody has to generate and commit JSON first.

## Overview

| | |
| --- | --- |
| Source of truth | `rl_insight/config/services/grafana/jsonnet/` inside the installed package |
| Who renders it | `rl_insight/server/runtime.py` at every `rl-insight server start` |
| Jsonnet dependency | `rjsonnet`, an ordinary Python dependency — no CLI, no Go, no compiler |
| Committed JSON | `rl_insight/config/services/grafana/dashboards/` — kept as the semantic baseline/reference, no longer the runtime source |

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
│   └── verify_modules.jsonnet            structure/fingerprint verification (development only)
└── framework/                            generic composer + visualization defaults
    ├── composer.libsonnet
    └── viz.libsonnet
```

### Jsonnet source files

| File | Purpose | Who normally changes it |
| --- | --- | --- |
| `dashboard_compositions.libsonnet` | Production registry: the `modules` of each dashboard plus its dashboard-level metadata, title, tags and ordering | Dashboard developer — the file changed most often |
| `dashboards/*.libsonnet` | The reusable panels, rows and variables of one subsystem | Whoever adds or changes that monitoring content |
| `dashboards.jsonnet` | Stable production entrypoint: imports the registry and composes every registered dashboard | Normally nobody |
| `framework/composer.libsonnet` | Generic composition semantics shared by every dashboard | Not ordinary dashboard developers |
| `framework/viz.libsonnet` | Generic visualization defaults | Only for a framework-level visualization change |
| `dashboards/verify_modules.jsonnet` | Migration/structure/fingerprint verification of the modules | Not ordinary users |

## Configuration files

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
   directory is copied as-is. This is the legacy static workflow; a configured
   directory that does not exist or is not a directory stops startup.
3. **Otherwise** — the Jsonnet entrypoint bundled in the installed package is
   rendered.
4. **`extra_dashboard_dir` always merges last**, on top of whatever the base
   source produced: recursive copy, invalid paths rejected, and a `.json` file
   that would collide with an already staged one stops startup.

In cases 1 and 3 the bundled dashboard folders are staged first and the
rendered compositions are materialized into the `verl` folder. Setting
`dashboard_config` replaces the built-in VERL Jsonnet composition layer: the
bundled `verl` folder is skipped and regenerated from whatever the config
produces, while the other bundled folders (`quick_start_demo`,
`agent_loop_trajectory`, `verl-omni`) are still staged. Every bundled dashboard
outside that layer keeps being served, the folder layout Grafana shows is
unchanged, and the Jsonnet-owned files are always freshly rendered.

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
the two registered production compositions are:

```text
verl_tainer_v1_with_vllm_engine   = verlBase + [vllm, npu]
verl_tainer_v1_with_sglang_engine = verlBase + [sglang]
```

Adding a dashboard is a registry entry; see the three developer cases below.

## Dashboard developer cases

Every case is a configuration change to the Jsonnet sources that ship with the
install. After the change, continue the normal RL-Insight development/startup
flow — the dashboard is materialized automatically at startup.

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

Then continue the normal RL-Insight development/startup flow — the dashboard is
materialized automatically at startup.

### 2. Add a Foo engine or other new content

1. Add `dashboards/foo.libsonnet` with the panels, rows and variables of the new
   subsystem.
2. Import it in `dashboard_compositions.libsonnet` and register a composition:

```jsonnet
verl_tainer_v1_with_foo_engine: {
  modules: verlBase + [foo],
  dashboard: { ... },
},
```

3. For a new visualization type or new composition behavior, change the generic
   `framework/` assets. Ordinary dashboards never need this.

Then continue the normal RL-Insight development/startup flow — the dashboard is
materialized automatically at startup.

### 3. Extend the trainer dashboard with `trainer_extra`

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
    verl_tainer_v1_with_vllm_engine: {
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
panel, row or variable — see [`framework/README.md`](framework/README.md) for the
row-extension rules.

Then continue the normal RL-Insight development/startup flow — the dashboard is
materialized automatically at startup.

## User customization

These three keys are what a user of an installed package needs. They all live
under `grafana:` in the server configuration.

| You want | Do this |
| --- | --- |
| Extra dashboards without touching the installed package | Put the `.json` files in a directory and pass `--extra-dashboard-dir <dir>` (`grafana.extra_dashboard_dir`). It is merged on top of the base source, last. |
| A completely different Jsonnet composition | Set `grafana.dashboard_config` to your own composition config. It replaces the built-in VERL Jsonnet composition layer and stops startup if it cannot be rendered. |
| To serve only your own static JSON | Set `grafana.dashboards_dir` to your directory; it replaces the built-in render. |

Dashboard developers are a different role: they change the Jsonnet sources in
the repository, and those sources ship with the install. An ordinary user does
not edit `site-packages`; use the keys above instead.

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
        │ BASE SOURCE — either the bundled dashboards plus a Jsonnet render,
        │ or a legacy static copy of grafana.dashboards_dir
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
under `<runtime_dir>` — the package sources, the committed JSON and the
configuration are read-only inputs.

`<runtime_dir>` is the server runtime directory (`~/.rl-insight/runtime` by
default), and the dashboards are rebuilt on every start, so a removed source
file never leaves a stale dashboard behind.

### Internal / debugging

`tools/grafana/generate_dashboards.py` is an optional internal wrapper over the
same renderer core the runtime uses. It is not part of any normal workflow —
ordinary users and dashboard developers never call it. Its arguments live in
`tools/grafana/framework/README.md` and in the script's `--help`.

## Changes by role

| Role | What changes | What to do |
| --- | --- | --- |
| RL-Insight / Grafana user | Nothing | Start and use RL-Insight as before; the same dashboards appear in the same folders |
| Dashboard developer | The Jsonnet modules or the registry in the repository; those sources ship with the install | Continue the normal development/startup flow — startup materializes your change |
| User with extra dashboards | Nothing | Keep using `--extra-dashboard-dir`; extra dashboards are merged on top |
| User with a custom composition | Set `grafana.dashboard_config` | Point it at your config; a broken config fails startup with a clear error |

## Limitations

- Composition is additive only; implicit panel/row/variable overrides are not
  supported. To change an existing panel, edit the module that owns it.
- `rowItems` only appends items to a row the composition renders as a
  `RowsLayoutRow` with a `GridLayout` layout; other extension targets fail
  evaluation.
- A custom `dashboard_config` is a standalone Jsonnet file: it has to import the
  packaged composer and modules by explicit path, and cannot rely on the
  package being added to any import path.
- The committed JSON is a baseline/reference for review and CI, not the runtime
  source; edit the Jsonnet sources instead of the generated files.
- Dashboards are rendered at startup, so a Jsonnet error surfaces as a failed
  `rl-insight server start` rather than as a missing dashboard in Grafana.

For generic composition rules and framework internals, see
[`framework/README.md`](framework/README.md).
