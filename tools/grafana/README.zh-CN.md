# Grafana dashboard 开发

> **英文版本：[README.md](README.md)**

Grafana dashboard 以可复用的 Jsonnet 模块的形式维护，并组合成 RL-Insight
所使用的、已提交的 Grafana JSON 文件。

目标是：

- 复用通用的 dashboard 内容，而不是复制大型 JSON 文件；
- 让新增和维护 dashboard 变体变得容易；
- 保持现有 RL-Insight / Grafana 运行时行为不变。

## 本文档面向谁？

| 角色                      | 会变化什么？                                       | 我应该做什么？                                                               |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| RL-Insight / Grafana 用户 | 运行时没有任何变化                                  | 完全像以前一样启动和使用 RL-Insight                                      |
| Dashboard 开发者          | Dashboard 以模块 + 组合的方式编写                   | 编辑 composition registry，只在需要时添加模块，然后生成 JSON |
| Framework 贡献者          | 只有通用的组合/渲染行为会变化                       | 参见 [`framework/README.md`](framework/README.md)                                |

## 变更前后

### 用户行为

变更前：

```text
RL-Insight startup
→ Grafana provisioning
→ committed dashboard JSON
→ Grafana
```

变更后：

```text
RL-Insight startup
→ Grafana provisioning
→ committed dashboard JSON
→ Grafana
```

**没有运行时行为变化**。

Grafana 不会执行 Jsonnet。`gojsonnet` 只在 dashboard 开发和生成期间使用。

### Dashboard 开发

变更前：

```text
copy / edit a complete Grafana JSON
→ repeat common changes across dashboard variants
```

变更后：

```text
reuse modules
→ define a composition
→ generate
→ verify
→ commit JSON
```

## 架构

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

对于普通的 dashboard 开发，主要入口是：

```text
tools/grafana/dashboard_compositions.libsonnet
```

如果你想定义某个生产 dashboard 由哪些模块组成，通常就是编辑这个文件。

不要向 `composer.libsonnet` 中添加 dashboard 专属逻辑。

## 可复用模块

| 模块         | 职责                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| `trainer`    | 训练指标：actor、critic、reward、loss、rollout、throughput、timing 等            |
| `controller` | Controller / 编排 / transfer-queue 控制指标                                      |
| `storage`    | 分区、存储和数据传输指标                                                         |
| `trajectory` | Tempo / TraceQL 状态时间线                                                       |
| `vllm`       | vLLM 推理和宿主机侧指标                                                          |
| `sglang`     | SGLang 推理指标                                                                  |
| `npu`        | Ascend NPU 指标                                                                  |

共享的 VERL base 是：

```text
verlBase
= trainer
+ controller
+ storage
+ trajectory
```

当前的生产 composition 是：

```text
vLLM dashboard
= verlBase + vllm + npu

SGLang dashboard
= verlBase + sglang
```

## 新增一个 dashboard

### 仅复用现有模块

如果新的 dashboard 只需要现有内容，则不需要新增模块。

例如：

```text
trainer + trajectory + npu
```

只需在以下文件中新增一个条目：

```text
tools/grafana/dashboard_compositions.libsonnet
```

示例：

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

然后生成 JSON：

```bash
python tools/grafana/generate_dashboards.py
```

### 新增一个 engine 或新增内容

如果新的 engine `foo` 有自己的 panel：

1. 新增一个模块：

```text
tools/grafana/dashboards/foo.libsonnet
```

2. 在以下文件中导入它：

```text
tools/grafana/dashboard_compositions.libsonnet
```

3. 新增一个 composition：

```jsonnet
verl_tainer_v1_with_foo_engine: {
  modules: verlBase + [foo],
  dashboard: {
    ...
  },
},
```

4. 生成并校验：

```bash
python tools/grafana/generate_dashboards.py
python tools/grafana/generate_dashboards.py --check
```

新增一个普通的 engine 或 dashboard **不需要**修改
`composer.libsonnet`、`viz.libsonnet`、`framework/generate.py` 或
`dashboards.jsonnet`。

## 扩展现有内容

一个 dashboard 可以复用某个 base 模块并添加额外内容。

例如：

```text
trainer + trainer_extra
```

### 新增一个 row

如果扩展添加的是一个全新的 section，请用 `rows` 定义它。

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

### 向现有 row 添加一个 panel

如果新 panel 应当出现在现有的 `training metric` row 内部，请使用
`rowItems`。

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

然后组合这两个模块：

```jsonnet
modules: [
  trainer,
  trainer_extra,
  controller,
  storage,
  trajectory,
]
```

扩展只做增量添加。它们不会静默覆盖现有的 panel、row 或 variable。

## 我应该修改什么？

| 任务                                 | 通常需要修改的文件                                                |
| ------------------------------------ | ----------------------------------------------------------------- |
| 使用现有模块的新 dashboard           | `dashboard_compositions.libsonnet`                                |
| 新 engine / 新内容                   | 新的 `dashboards/*.libsonnet` + `dashboard_compositions.libsonnet` |
| 扩展现有内容                         | 新的扩展模块 + `dashboard_compositions.libsonnet`                 |
| 新的共享可视化类型                   | framework 变更                                                    |
| 新的 composition 行为                | framework 变更                                                    |

对于普通的 dashboard 新增，不要修改 framework。

## 生成与校验

生成所有已注册的生产 dashboard：

```bash
python tools/grafana/generate_dashboards.py
```

校验已提交的 JSON 与 Jsonnet 源文件一致：

```bash
python tools/grafana/generate_dashboards.py --check
```

生产环境的 `--check` 比较的是解析后的 JSON 对象，因此仅由序列化导致的 key
顺序差异会被忽略。

结构性迁移检查也可在以下文件中使用：

```text
tools/grafana/dashboards/verify_modules.jsonnet
```

## 运行时行为

生成的 JSON 仍然提交在以下目录下：

```text
rl_insight/config/services/grafana/dashboards/verl/
```

Grafana 继续通过现有的 provisioning 配置加载这些文件。

现有用户不需要：

- 安装 Jsonnet；
- 运行生成器；
- 修改启动命令；
- 修改 Grafana 配置。

Jsonnet 只是开发期的源文件格式。

## 限制

- composition 只做增量添加；不支持隐式覆盖。
- `rowItems` 只会向现有的、受支持的 `GridLayout` row 追加条目。
- 无法通过 `rowItems` 删除或重排现有的 row 条目。
- 生成的生产 JSON 不应手工维护；应改为更新源模块或 composition 并重新生成。

关于通用的组合规则和 framework 内部实现，参见
[`framework/README.md`](framework/README.md)。
