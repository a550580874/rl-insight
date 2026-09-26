# Grafana dashboard development

> **简体中文版本: [README.zh-CN.md](README.zh-CN.md)**

RL-Insight's Grafana dashboards are maintained as reusable Jsonnet modules that
are composed into the committed Grafana JSON files the running service loads.

## Architecture

The pipeline has a development-time half (sources → generator → committed JSON)
and a runtime half (startup → provisioning → Grafana). Every arrow below states
what the next step actually does.

```text
tools/grafana/dashboards/*.libsonnet
    reusable content modules: panels / rows / variables for one subsystem each
        │
        │ IMPORTED BY — the composition registry imports the modules it needs
        ▼
tools/grafana/dashboard_compositions.libsonnet
    the composition registry: which modules make up each dashboard
        │
        │ READ BY — dashboards.jsonnet reads every composition registered here
        ▼
tools/grafana/dashboards.jsonnet
    thin entrypoint: composes every registered composition
        │
        │ COMPOSED BY — composer.compose(modules, dashboard) merges the
        │ selected modules into one complete dashboard object
        ▼
tools/grafana/framework/composer.libsonnet
        │
        │ RENDERED BY — the generator evaluates this Jsonnet with go-jsonnet
        │ and serializes the result to JSON text
        ▼
tools/grafana/generate_dashboards.py
        │
        │ WRITTEN TO — one <composition-name>.json per registered dashboard
        ▼
rl_insight/config/services/grafana/dashboards/verl/*.json
    generated production dashboards, committed to the repository
        │
        │ COPIED AT STARTUP BY — rl_insight/server/runtime.py
        │ _stage_grafana_dashboards() copies these files into the runtime dir
        ▼
<runtime_dir>/dashboards
        │
        │ LOADED BY — Grafana reads the provisioning file written by
        │ _render_grafana_provisioning(), which points at this directory
        ▼
Grafana
    the service that loads and displays the dashboards
```

The same pipeline in words:

1. **Select** — `dashboard_compositions.libsonnet` imports the reusable modules
   and records, per dashboard, which modules belong to it.
2. **Compose** — `dashboards.jsonnet` calls
   `composer.compose(modules, dashboard)` for every registry entry, merging the
   selected modules into one complete dashboard object.
3. **Render** — `generate_dashboards.py` evaluates that Jsonnet with go-jsonnet
   and serializes the result deterministically.
4. **Write** — the generator writes one `<composition-name>.json` per
   registered dashboard into
   `rl_insight/config/services/grafana/dashboards/verl/`; those files are
   committed.
5. **Copy at startup** — `rl_insight/server/runtime.py:prepare_files()` calls
   `_stage_grafana_dashboards()`, which copies the committed JSON into the
   runtime directory.
6. **Load** — Grafana reads the provisioning file that
   `_render_grafana_provisioning()` wrote and loads the dashboards from the
   directory it points at.

The goals of this structure are:

- reuse common dashboard content instead of copying large JSON files;
- make new dashboard variants easy to add and maintain;
- keep the existing RL-Insight / Grafana runtime behavior unchanged.

## Who is this for?

| Role                      | What changes?                                     | What should I do?                                                                                  |
| ------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| RL-Insight / Grafana user | Nothing at runtime                                | Start and use RL-Insight exactly as before                                                         |
| Dashboard developer       | Dashboards are authored as modules + compositions | Edit the composition registry, add modules only when needed, then generate and commit the JSON      |

## Runtime behavior

Runtime behavior is **exactly the same before and after** this refactor. There
is one runtime path, it never evaluates Jsonnet, and it is drawn once here:

```text
RL-Insight startup
        │
        │ PREPARED BY — prepare_files() copies the committed dashboard JSON
        │ into the runtime directory and writes the Grafana provisioning file
        │ that points at it
        ▼
Grafana provisioning
        │
        │ DISCOVERED BY — at startup Grafana reads that configuration and
        │ finds the dashboard files it lists
        ▼
committed dashboard JSON
        │
        │ READ BY — Grafana parses those files and displays the dashboards
        ▼
Grafana
```

Terms used above:

| Term                       | Meaning                                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provisioning`             | Grafana's configuration-driven dashboard discovery: at startup Grafana reads its provisioning files and loads the dashboard files those files point at.                                         |
| `committed dashboard JSON` | The final, already-generated Grafana JSON stored in the repository (`rl_insight/config/services/grafana/dashboards/verl/*.json`). The runtime reads this JSON directly; it is the runtime input. |
| `Grafana`                  | The service that actually loads and displays the dashboards.                                                                                                                                    |
| `gojsonnet`                | The engine that evaluates Jsonnet into JSON. It runs only during dashboard development and generation, never in the user runtime.                                                               |

## Is generation automatic?

**No.** An ordinary RL-Insight user never runs the generator, and nothing in
the startup path evaluates Jsonnet.

At startup, `rl_insight/server/runtime.py:prepare_files()` handles Grafana in
three steps (`runtime.py:112`–`115`):

1. `_render_grafana_config()` writes `grafana.ini`;
2. `_stage_grafana_dashboards()` copies the **already committed** JSON from
   `grafana.dashboards_dir` (`rl_insight/config/services/grafana/dashboards/`)
   into the runtime directory. It only copies files — it never runs the
   generator;
3. `_render_grafana_provisioning()` writes
   `provisioning/dashboards/default.yml`, a Grafana file provider whose
   `options.path` points at that runtime directory.

So the generated JSON is never produced at startup; it is produced once, by a
developer, and committed.

A dashboard developer who changes the Jsonnet sources must therefore generate
manually — run `python tools/grafana/generate_dashboards.py`, then
`python tools/grafana/generate_dashboards.py --check`, then commit the
regenerated JSON. See [Generate and verify](#generate-and-verify) for the
commands and for what `--check` compares.

## Two generation layers

Generation is split into two layers. **Neither layer is a step in the startup
path**, and the repository has no CI job that invokes them today.

| Layer                          | File                                   | Responsibility                                                                                                                                                                                                                                                                                               |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production wrapper (#173)      | `tools/grafana/generate_dashboards.py` | Production-specific defaults only: it points the framework generator at `tools/grafana/dashboards.jsonnet` and at the committed output directory `rl_insight/config/services/grafana/dashboards/verl/`. Its `--check` compares parsed JSON objects, so serialization-only key-order differences are ignored. |
| Framework core (generic, #174) | `tools/grafana/framework/generate.py`  | The reusable render/serialize core: evaluates a composition config with go-jsonnet, serializes deterministically (sorted keys, fixed indentation), and exposes `render()` and `generated_text()`.                                                                                                            |

`generate_dashboards.py` does not reimplement any of that; it imports
`generate` from `tools/grafana/framework/`. That framework directory belongs to
the generic composition change (#174) and is not vendored on this branch.

## Dashboard development: before and after

### Before

Every dashboard was one complete Grafana JSON file — thousands of lines —
committed to the repository, and a new variant was made by copying such a file
and editing the copy.

```text
one complete Grafana JSON per dashboard
        │
        │ COPY AND EDIT — every variant starts as a full copy of an existing file
        ▼
several near-identical large JSON files
        │
        │ REPEAT BY HAND — a shared change must be applied to every copy
        ▼
the copies drift apart
```

The maintenance problem: a shared change (a new panel, a renamed variable, a
threshold fix) had to be repeated by hand in every copy, nothing kept the copies
in sync, and reviewing a change meant reading a multi-thousand-line JSON diff.

### After

The content dashboards have in common is factored into reusable modules. A
module owns a slice of dashboard content — its panels, rows, and variables —
for one subsystem. A composition names which modules make up a dashboard, and
the generator merges them into one complete Grafana JSON file.

```text
panels / rows / variables split into reusable modules
        │
        │ SELECT — a composition names the modules that make up one dashboard
        ▼
composition registry (dashboard_compositions.libsonnet)
        │
        │ COMPOSE — the generator merges exactly those modules
        ▼
one complete Grafana JSON file per dashboard
```

What this fixes:

- a shared change is made once, in the module that owns it, instead of in every
  copy;
- adding a dashboard variant is one registry entry, not another copy of a large
  JSON file;
- dashboard content is reviewed as small modules instead of one huge JSON diff.

## Reusable modules

| Module       | Responsibility                                                                   |
| ------------ | -------------------------------------------------------------------------------- |
| `trainer`    | Training metrics: actor, critic, reward, loss, rollout, throughput, timing, etc. |
| `controller` | Controller / orchestration / transfer-queue control metrics                      |
| `storage`    | Partition, storage, and data-transfer metrics                                    |
| `trajectory` | Tempo / TraceQL state timeline                                                   |
| `vllm`       | vLLM inference and host-side metrics                                             |
| `sglang`     | SGLang inference metrics                                                         |
| `npu`        | Ascend NPU metrics                                                               |

The shared VERL base is:

```text
verlBase
= trainer
+ controller
+ storage
+ trajectory
```

Current production compositions are:

```text
vLLM dashboard
= verlBase + vllm + npu

SGLang dashboard
= verlBase + sglang
```

## Add a new dashboard

### Reuse existing modules only

If a new dashboard only needs existing content, no new module is required.

For example:

```text
trainer + trajectory + npu
```

Only add a new entry in:

```text
tools/grafana/dashboard_compositions.libsonnet
```

Example:

```jsonnet
my_verl_dashboard: {
  modules: [
    trainer,
    trajectory,
    npu,
  ],
  dashboard: {
    metadata: {
      name: 'my-verl-dashboard',
      labels: {},
      annotations: {},
    },
    title: 'my_verl_dashboard',
    tags: ['RL-Insight', 'verl'],
    spec: productionSpec,
    variableOrder: [
      'datasource',
      'project',
      'experiment_name',
      'npu_instance',
    ],
    rowOrder: [
      'rl state timeline',
      'training metric',
    ],
  },
},
```

Then generate the JSON:

```bash
python tools/grafana/generate_dashboards.py
```

### Add a new engine or new content

If a new engine `foo` has its own panels:

1. Add a module:

```text
tools/grafana/dashboards/foo.libsonnet
```

2. Import it in:

```text
tools/grafana/dashboard_compositions.libsonnet
```

3. Add a composition:

```jsonnet
verl_tainer_v1_with_foo_engine: {
  modules: verlBase + [foo],
  dashboard: {
    ...
  },
},
```

4. Generate and verify:

```bash
python tools/grafana/generate_dashboards.py
python tools/grafana/generate_dashboards.py --check
```

Adding a normal engine or dashboard does **not** require changes to
`composer.libsonnet`, `viz.libsonnet`, `framework/generate.py`, or
`dashboards.jsonnet`.

## Extend existing content

A dashboard may reuse a base module and add extra content.

For example:

```text
trainer + trainer_extra
```

### Add a new row

If the extension adds a completely new section, define it with `rows`.

```jsonnet
{
  panels: [
    ...
  ],
  rows: {
    'custom training metric': {
      ...
    },
  },
}
```

### Add a panel to an existing row

If the new panel should appear inside the existing `training metric` row, use
`rowItems`.

```jsonnet
{
  panels: [{
    key: 'training.custom.foo',
    outputKey: 'panel-custom-foo',
    id: 500,
    title: 'Custom Foo Metric',
    queries: [{
      expr: 'custom_foo_metric',
    }],
  }],

  rowItems: {
    'training metric': [{
      kind: 'GridLayoutItem',
      spec: {
        x: 0,
        y: 100,
        width: 12,
        height: 8,
        element: {
          kind: 'ElementReference',
          name: 'training.custom.foo',
        },
      },
    }],
  },
}
```

Then compose both modules:

```jsonnet
modules: [
  trainer,
  trainer_extra,
  controller,
  storage,
  trajectory,
]
```

Extensions are additive only. They do not silently override existing panels,
rows, or variables.

## What should I modify?

| Task                                 | Files normally changed                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| New dashboard using existing modules | `dashboard_compositions.libsonnet`                                |
| New engine / new content             | new `dashboards/*.libsonnet` + `dashboard_compositions.libsonnet` |
| Extend existing content              | new extension module + `dashboard_compositions.libsonnet`         |
| New shared visualization type        | framework change                                                  |
| New composition behavior             | framework change                                                  |

For ordinary dashboard additions, do not modify the framework.

## Generate and verify

Generate all registered production dashboards:

```bash
python tools/grafana/generate_dashboards.py
```

Verify that committed JSON matches the Jsonnet sources:

```bash
python tools/grafana/generate_dashboards.py --check
```

Production `--check` compares parsed JSON objects, so serialization-only key
ordering differences are ignored.

Structural migration checks are also available in:

```text
tools/grafana/dashboards/verify_modules.jsonnet
```

## Limitations

- Composition is additive only; implicit overrides are not supported.
- `rowItems` only appends items to an existing supported `GridLayout` row.
- Existing row items cannot be removed or reordered through `rowItems`.
- Generated production JSON should not be manually maintained; update the
  source module or composition and regenerate it instead.

For generic composition rules and framework internals, see
[`framework/README.md`](framework/README.md).
