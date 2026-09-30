# README

# Grafana dashboard

> **Chinese version: [README.zh-CN.md](README.zh-CN.md)**

RL-Insight Grafana Dashboards are configured and maintained with **Jsonnet**. Regular users do not need to change how they use RL-Insight. Dashboard developers mainly work with Jsonnet configuration files and modules. When the service starts, RL-Insight automatically generates the JSON required by Grafana, so there is no need to generate or commit JSON manually. The original static Dashboards are still kept and loaded alongside the Jsonnet-generated versions.

## Overview

![ChatGPT 图像 2026年9月30日 17_40_22](/Users/ming-shen/Downloads/ChatGPT 图像 2026年9月30日 17_40_22.png)

![ChatGPT 图像 2026年9月30日 17_40_32](/Users/ming-shen/Downloads/ChatGPT 图像 2026年9月30日 17_40_32.png)



## Usage Scenarios

All of the following scenarios involve modifying the Jsonnet source files. After the changes are made, continue with the normal RL-Insight development/startup workflow. The Dashboard JSON is generated automatically when the service starts, so no manual generation step is required.

### 1. Create a New Dashboard by Reusing Existing Modules

If existing modules such as `trainer`, `trajectory`, and `npu` already contain the monitoring content you need, you do not need to create another `.libsonnet` file. You only need to add a new Dashboard entry under `compositions` in:

```text
dashboard_compositions.libsonnet
```

For example:

```jsonnet
{
  compositions: {
    my_verl_dashboard: {
      modules: [trainer, trajectory, npu],

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
  },
}
```

The newly added entry:

```jsonnet
my_verl_dashboard: {
    ...
}
```

defines a new Dashboard.

The following configuration:

```jsonnet
modules: [trainer, trajectory, npu]
```

means that the Dashboard combines the content provided by these three modules:

```text
trainer
    +
trajectory
    +
npu
    ↓
my_verl_dashboard
```

### 2. Add a New Foo Engine or Another New Module

If existing modules such as `trainer`, `vllm`, `sglang`, and `npu` do not contain the monitoring content you need, create a new `.libsonnet` module.

First, add:

```text
foo.libsonnet
```

under:

```text
rl_insight/config/services/grafana/jsonnet/dashboards/
```

For example:

```jsonnet
{
  panels: [
    // Foo Engine panels
  ],

  rows: {
    // Foo Engine rows
  },

  variables: {
    // Variables used by Foo Engine
  },
}
```

Then import the module in:

```text
dashboard_compositions.libsonnet
```

```jsonnet
local foo = import 'dashboards/foo.libsonnet';
```

Next, add a new Dashboard composition or update an existing one:

```jsonnet
verl_tainer_v1_with_foo_engine_jsonnet: {
  modules: verlBase + [foo],

  dashboard: {
    metadata: {
      name: 'foo-dashboard-id',
      labels: {},
      annotations: {},
    },

    title: 'verl_trainer_v1_with_foo_engine_jsonnet',

    tags: [
      'RL-Insight',
      'verl',
      'foo',
    ],

    spec: productionSpec,

    variableOrder: [
      'datasource',
      'project',
      'experiment_name',
    ],

    rowOrder: [
      'rl state timeline',
      'training metric',
      'foo engine metric',
    ],
  },
},
```

Here:

```jsonnet
modules: verlBase + [foo]
```

means:

```text
trainer
+ controller
+ storage
+ trajectory
+ foo
↓
Foo Engine Dashboard
```

In other words, the Dashboard reuses the existing VERL base modules and then adds the new `foo` module.

---

### 3. Add New Monitoring Content to an Existing Dashboard

If you only want to add panels or rows to an existing Dashboard, you can create an extension module instead of modifying the original `trainer.libsonnet`, `vllm.libsonnet`, or other existing module directly.

For example, add:

```text
dashboards/trainer_extra.libsonnet
```

with:

```jsonnet
{
  panels: [{
    key: 'training_extra.custom',
    outputKey: 'panel-training-extra-custom',
    id: 500,
    title: 'Custom training metric',
    queries: [{
      expr: 'custom_training_metric',
    }],
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

Then import it in:

```text
dashboard_compositions.libsonnet
```

```jsonnet
local trainer_extra =
  import 'dashboards/trainer_extra.libsonnet';
```

Add the module to the existing Dashboard:

```jsonnet
modules: verlBase + [trainer_extra, vllm, npu],
```

If `trainer_extra` adds a new row, also add that row to:

```text
rowOrder
```

For example:

```jsonnet
rowOrder: [
  'rl state timeline',
  'training metric',
  'vllm engine metric',
  'transfer queue metric',
  'hardware metric',
  'training extra metric',
],
```

The generated Dashboard will then include the monitoring content defined in `trainer_extra`.

If you only need to add a panel to an existing row, you can use `rowItems` instead of creating a new row.

---

### 4. Modify the Framework

For normal Dashboard additions or updates, you usually only need to modify:

```text
dashboards/*.libsonnet
```

and:

```text
dashboard_compositions.libsonnet
```

Only modify the shared framework when you need to change generic capabilities:

```text
framework/
```

The framework currently contains:

```text
framework/
├── composer.libsonnet
└── viz.libsonnet
```

#### 4.1 Modify Shared Visualization Defaults

If you need to add or adjust Grafana visualization defaults that can be reused by all Dashboards, modify:

```text
framework/viz.libsonnet
```

For example, this is where shared visualization templates such as the following are defined:

```text
timeseries
stat
heatmap
bargauge
```

#### 4.2 Modify Dashboard Composition Rules

If you need to change how modules are combined, for example by adding a new generic composition behavior, modify:

```text
framework/composer.libsonnet
```

It combines the following module content into the final Dashboard:

```text
panels
rows
variables
rowItems
```

In general:

```text
Add a panel / metric / row / variable
→ modify dashboards/*.libsonnet

Add or adjust a Dashboard composition
→ modify dashboard_compositions.libsonnet

Add shared visualization capabilities
→ modify framework/viz.libsonnet

Modify generic composition rules
→ modify framework/composer.libsonnet
```
