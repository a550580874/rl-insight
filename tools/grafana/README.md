# Grafana dashboard development

Grafana dashboards are maintained as reusable Jsonnet modules and composed into
the committed Grafana JSON files used by RL-Insight.

The goals are:

- reuse common dashboard content instead of copying large JSON files;
- make new dashboard variants easy to add and maintain;
- keep the existing RL-Insight / Grafana runtime behavior unchanged.

## Who is this for?

| Role                      | What changes?                                       | What should I do?                                                               |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| RL-Insight / Grafana user | Nothing at runtime                                  | Start and use RL-Insight exactly as before                                      |
| Dashboard developer       | Dashboards are authored as modules + compositions   | Edit the composition registry, add modules only when needed, then generate JSON |
| Framework contributor     | Only generic composition/rendering behavior changes | See [`framework/README.md`](framework/README.md)                                |

## Before and after

### User behavior

Before:

```text
RL-Insight startup
→ Grafana provisioning
→ committed dashboard JSON
→ Grafana
```

After:

```text
RL-Insight startup
→ Grafana provisioning
→ committed dashboard JSON
→ Grafana
```

There is **no runtime behavior change**.

Grafana does not execute Jsonnet. `gojsonnet` is only used during dashboard
development and generation.

### Dashboard development

Before:

```text
copy / edit a complete Grafana JSON
→ repeat common changes across dashboard variants
```

After:

```text
reuse modules
→ define a composition
→ generate
→ verify
→ commit JSON
```

## Architecture

```text
dashboards/*.libsonnet
        │
        │ reusable panels / rows / variables
        ▼
dashboard_compositions.libsonnet
        │
        │ defines which modules make up each dashboard
        ▼
dashboards.jsonnet
        │
        ▼
framework/composer.libsonnet
        │
        ▼
generate_dashboards.py
        │
        ▼
rl_insight/config/services/grafana/dashboards/verl/*.json
        │
        ▼
Grafana provisioning
```

For normal dashboard development, the main entry point is:

```text
tools/grafana/dashboard_compositions.libsonnet
```

If you want to define which modules make up a production dashboard, this is
the file you normally edit.

Do not add dashboard-specific logic to `composer.libsonnet`.

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

## Runtime behavior

Generated JSON remains committed under:

```text
rl_insight/config/services/grafana/dashboards/verl/
```

Grafana continues to load those files through the existing provisioning
configuration.

Existing users do not need to:

- install Jsonnet;
- run the generator;
- change startup commands;
- change Grafana configuration.

Jsonnet is a development-time source format only.

## Limitations

- Composition is additive only; implicit overrides are not supported.
- `rowItems` only appends items to an existing supported `GridLayout` row.
- Existing row items cannot be removed or reordered through `rowItems`.
- Generated production JSON should not be manually maintained; update the
  source module or composition and regenerate it instead.

For generic composition rules and framework internals, see
[`framework/README.md`](framework/README.md).
