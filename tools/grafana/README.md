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

In cases 1 and 3 the dashboards bundled in the package are staged first and the
rendered compositions are materialized over the `verl` folder, so every bundled
dashboard is still served, the folder layout Grafana shows is unchanged, and the
Jsonnet-owned files are always freshly rendered.

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

Every case is a source edit. There is no generate-and-commit step, and no
command to remember — the next `rl-insight server start` renders what is in the
package.

### 1. A new dashboard from existing modules

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

### 2. A new engine or new content

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

### 3. Extend existing content

Reuse a module and add to it. Extensions are additive: an extension cannot
silently override a panel, row or variable.

```jsonnet
{
  panels: [{
    key: 'training.custom.foo',
    outputKey: 'panel-custom-foo',
    id: 500,
    title: 'Custom Foo Metric',
    queries: [{ expr: 'custom_foo_metric' }],
  }],
  rowItems: {
    'training metric': [{
      kind: 'GridLayoutItem',
      spec: {
        x: 0,
        y: 100,
        width: 12,
        height: 8,
        element: { kind: 'ElementReference', name: 'training.custom.foo' },
      },
    }],
  },
}
```

Use `rows` when the extension owns a whole new section, and `rowItems` to append
panels to a row another module already created.

## User customization

| You want | Do this |
| --- | --- |
| Extra dashboards without touching the installed package | Put the `.json` files in a directory and pass `--extra-dashboard-dir <dir>`. It is merged on top of the built-in dashboards. |
| A completely different Jsonnet composition | Set `grafana.dashboard_config` to your own composition config. It replaces the built-in Jsonnet layer and stops startup if it cannot be rendered. |
| To serve only your own static JSON | Set `grafana.dashboards_dir` to your directory; it replaces the built-in render. |
| To change the built-in dashboards for a project-local install | Edit the package sources (see the developer cases) and restart the stack. |

A custom `dashboard_config` may import the packaged framework and modules with a
relative path from where you keep it:

```jsonnet
local composer = import '../rl_insight/config/services/grafana/jsonnet/framework/composer.libsonnet';
local npu = import '../rl_insight/config/services/grafana/jsonnet/dashboards/npu.libsonnet';

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

`tools/grafana/generate_dashboards.py` is an optional wrapper over the same
renderer core. It is not part of any normal workflow; it exists to refresh the
committed JSON baseline and to check it in CI:

```bash
python tools/grafana/generate_dashboards.py            # refresh the baseline
python tools/grafana/generate_dashboards.py --check    # exit 1 on semantic drift
```

`--check` compares parsed JSON objects, so serialization-only key-order
differences are ignored.

## Changes by role

| Role | What changes | What to do |
| --- | --- | --- |
| RL-Insight / Grafana user | Nothing | Start and use RL-Insight as before; the same dashboards appear in the same folders |
| Dashboard developer | Edit Jsonnet modules or the registry in the package | Restart the stack — startup renders your change |
| User with extra dashboards | Nothing | Keep using `--extra-dashboard-dir`; extra dashboards are merged on top |
| User with a custom composition | Set `grafana.dashboard_config` | Point it at your config; a broken config fails startup with a clear error |

## Limitations

- Composition is additive only; implicit panel/row/variable overrides are not
  supported. To change an existing panel, edit the module that owns it.
- `rowItems` only appends items to an existing supported `GridLayout` row.
- A custom `dashboard_config` is a plain Jsonnet file, so imports of the
  packaged framework and modules must use paths relative to that file.
- The committed JSON is a baseline/reference for review and CI, not the runtime
  source; edit the Jsonnet sources instead of the generated files.
- Dashboards are rendered at startup, so a Jsonnet error surfaces as a failed
  `rl-insight server start` rather than as a missing dashboard in Grafana.

For generic composition rules and framework internals, see
[`framework/README.md`](framework/README.md).
