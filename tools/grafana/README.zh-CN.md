# Grafana dashboard 开发

> **英文版本：[README.md](README.md)**

RL-Insight 的 Grafana dashboard 以可复用的 Jsonnet 模块维护，并被组合成运行时服务所加载的、已提交的 Grafana JSON 文件。

## 架构

这条链路分为两半：开发期（源文件 → 生成器 → 已提交 JSON）和运行时（启动 → provisioning → Grafana）。下面每一段箭头都写明下一步实际做了什么。

```text
tools/grafana/dashboards/*.libsonnet
    可复用内容模块：每个子系统一份 panels / rows / variables
        │
        │ IMPORTED BY（被谁导入）—— composition registry 导入它需要的模块
        ▼
tools/grafana/dashboard_compositions.libsonnet
    composition registry：每个 dashboard 由哪些模块组成
        │
        │ READ BY（被谁读取）—— dashboards.jsonnet 读取这里注册的每一个 composition
        ▼
tools/grafana/dashboards.jsonnet
    薄入口：组合所有已注册的 composition
        │
        │ COMPOSED BY（被谁组合）—— composer.compose(modules, dashboard)
        │ 把选中的模块合并成一个完整的 dashboard 对象
        ▼
tools/grafana/framework/composer.libsonnet
        │
        │ RENDERED BY（被谁渲染）—— 生成器用 go-jsonnet 对该 Jsonnet 求值，
        │ 并把结果序列化为 JSON 文本
        ▼
tools/grafana/generate_dashboards.py
        │
        │ WRITTEN TO（写入到哪里）—— 每个已注册 dashboard 一个 <composition-name>.json
        ▼
rl_insight/config/services/grafana/dashboards/verl/*.json
    生成好的生产 dashboard，已提交到仓库
        │
        │ COPIED AT STARTUP BY（启动时被谁复制）—— rl_insight/server/runtime.py
        │ 的 _stage_grafana_dashboards() 把这些文件复制到运行时目录
        ▼
<runtime_dir>/dashboards
        │
        │ LOADED BY（被谁加载）—— Grafana 读取 _render_grafana_provisioning()
        │ 写出的 provisioning 文件，该文件指向这个目录
        ▼
Grafana
    实际加载并展示 dashboard 的服务
```

同一条链路用文字说明：

1. **选择（Select）** —— `dashboard_compositions.libsonnet` 导入可复用模块，并逐个 dashboard 记录它由哪些模块组成。
2. **组合（Compose）** —— `dashboards.jsonnet` 对每个注册项调用 `composer.compose(modules, dashboard)`，把选中的模块合并成一个完整的 dashboard 对象。
3. **渲染（Render）** —— `generate_dashboards.py` 用 go-jsonnet 对该 Jsonnet 求值，并以确定性方式序列化结果。
4. **写入（Write）** —— 生成器把每个已注册 dashboard 写成 `rl_insight/config/services/grafana/dashboards/verl/` 下的一个 `<composition-name>.json`；这些文件会被提交。
5. **启动时复制（Copy at startup）** —— `rl_insight/server/runtime.py:prepare_files()` 调用 `_stage_grafana_dashboards()`，把已提交的 JSON 复制到运行时目录。
6. **加载（Load）** —— Grafana 读取 `_render_grafana_provisioning()` 写出的 provisioning 文件，并从它指向的目录加载 dashboard。

这套结构的目标是：

- 复用通用的 dashboard 内容，而不是复制大型 JSON 文件；
- 让新增和维护 dashboard 变体变得容易；
- 保持现有 RL-Insight / Grafana 运行时行为不变。

## 本文档面向谁？

| 角色                      | 会变化什么？                                      | 我应该做什么？                                                                          |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| RL-Insight / Grafana 用户 | 运行时没有任何变化                                | 完全像以前一样启动和使用 RL-Insight                                                     |
| Dashboard 开发者          | Dashboard 以模块 + 组合的方式编写                 | 编辑 composition registry，只在需要时添加模块，然后生成并提交 JSON                      |

## 运行时行为

本次重构**变更前后运行时行为完全一致**。运行时只有一条路径，它从不执行 Jsonnet，这里只画一次：

```text
RL-Insight 启动
        │
        │ PREPARED BY（由谁准备）—— prepare_files() 把已提交的 dashboard JSON
        │ 复制到运行时目录，并写出指向该目录的 Grafana provisioning 文件
        │ （即该配置指向这些 dashboard 文件）
        ▼
Grafana provisioning
        │
        │ DISCOVERED BY（由谁发现）—— Grafana 启动时读取该配置，
        │ 找到其中列出的 dashboard 文件
        ▼
committed dashboard JSON
        │
        │ READ BY（由谁读取）—— Grafana 解析这些文件并展示 dashboard
        ▼
Grafana
```

上图中的名词含义：

| 名词                       | 含义                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provisioning`             | Grafana 的“按配置发现 dashboard”机制：Grafana 启动时读取自己的 provisioning 文件，并加载这些文件所指向的 dashboard 文件。                                                  |
| `committed dashboard JSON` | 仓库中已生成并提交的最终 Grafana JSON（`rl_insight/config/services/grafana/dashboards/verl/*.json`）。运行时直接读取这份 JSON，它是运行时的输入。                          |
| `Grafana`                  | 实际加载并展示 dashboard 的服务。                                                                                                                                          |
| `gojsonnet`                | 把 Jsonnet 求值为 JSON 的引擎。它只在 dashboard 开发和生成期间运行，绝不在用户运行时执行。                                                                                  |

## 生成是自动的吗？

**不是。** 普通的 RL-Insight 用户从不执行生成脚本，启动链路上也没有任何一步会对 Jsonnet 求值。

启动时，`rl_insight/server/runtime.py:prepare_files()` 对 Grafana 做三件事（`runtime.py:112`–`115`）：

1. `_render_grafana_config()` 写出 `grafana.ini`；
2. `_stage_grafana_dashboards()` 把 `grafana.dashboards_dir`（`rl_insight/config/services/grafana/dashboards/`）下**已经提交**的 JSON 复制到运行时目录。它只复制文件——从不执行生成器；
3. `_render_grafana_provisioning()` 写出 `provisioning/dashboards/default.yml`，这是一个 Grafana file provider，其 `options.path` 指向该运行时目录。

所以生成出来的 JSON 不会在启动时产生；它由开发者生成一次，然后提交。

因此，dashboard 开发者修改 Jsonnet 源文件后必须手动生成——运行 `python tools/grafana/generate_dashboards.py`，再运行 `python tools/grafana/generate_dashboards.py --check`，然后提交重新生成的 JSON。命令以及 `--check` 的比较方式见[生成与校验](#生成与校验)。

## 两个生成层次

生成分成两层。**这两层都不是启动链路中的步骤**，并且仓库当前没有任何 CI 任务会调用它们。

| 层次                   | 文件                                   | 职责                                                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 生产薄封装（#173）     | `tools/grafana/generate_dashboards.py` | 只提供生产相关的默认值：把框架生成器指向 `tools/grafana/dashboards.jsonnet` 和已提交的输出目录 `rl_insight/config/services/grafana/dashboards/verl/`。它的 `--check` 比较解析后的 JSON 对象，因此仅由序列化导致的 key 顺序差异会被忽略。 |
| 框架核心（通用，#174） | `tools/grafana/framework/generate.py`  | 可复用的渲染/序列化核心：用 go-jsonnet 对 composition 配置求值，以确定性方式序列化（key 排序、固定缩进），并对外提供 `render()` 和 `generated_text()`。                                                                                    |

`generate_dashboards.py` 没有重新实现上述任何逻辑；它从 `tools/grafana/framework/` 导入 `generate`。该 framework 目录属于通用组合改动（#174），本分支没有把它复制进来。

## Dashboard 开发：变更前后

### 变更前

每个 dashboard 都是仓库里一个完整的 Grafana JSON 文件——数千行；新增一个变体的做法是复制这样一个文件再改。

```text
每个 dashboard 一个完整的 Grafana JSON
        │
        │ COPY AND EDIT（复制并修改）—— 每个变体都从现有文件的完整副本开始
        ▼
若干个几乎相同的大型 JSON 文件
        │
        │ REPEAT BY HAND（手工重复）—— 共享的改动必须在每份副本上重做一遍
        ▼
各副本逐渐不一致
```

维护问题在于：一处共享改动（新增一个 panel、重命名一个 variable、修正一个阈值）必须在每份副本里手工重复，没有任何机制让这些副本保持同步，而评审一次改动意味着要读一份数千行的 JSON diff。

### 变更后

dashboard 之间共有的内容被抽成可复用模块。一个模块拥有某个子系统的一份 dashboard 内容——它的 panels、rows 和 variables。composition 指明一个 dashboard 由哪些模块组成，生成器再把它们合并成一个完整的 Grafana JSON 文件。

```text
panels / rows / variables 拆分为可复用模块
        │
        │ SELECT（选择）—— composition 指明组成一个 dashboard 的模块
        ▼
composition registry（dashboard_compositions.libsonnet）
        │
        │ COMPOSE（组合）—— 生成器只合并这些选中的模块
        ▼
每个 dashboard 一个完整的 Grafana JSON 文件
```

这解决了什么：

- 共享改动只需改一次，改在拥有它的模块里，而不是每份副本里；
- 新增一个 dashboard 变体只是加一条注册项，而不是再复制一份大型 JSON；
- dashboard 内容以小型模块的形式被评审，而不是一份巨大的 JSON diff。

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

新增一个普通的 engine 或 dashboard **不需要**修改 `composer.libsonnet`、`viz.libsonnet`、`framework/generate.py` 或 `dashboards.jsonnet`。

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

如果新 panel 应当出现在现有的 `training metric` row 内部，请使用 `rowItems`。

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

生产环境的 `--check` 比较的是解析后的 JSON 对象，因此仅由序列化导致的 key 顺序差异会被忽略。

结构性迁移检查也可在以下文件中使用：

```text
tools/grafana/dashboards/verify_modules.jsonnet
```

## 限制

- composition 只做增量添加；不支持隐式覆盖。
- `rowItems` 只会向现有的、受支持的 `GridLayout` row 追加条目。
- 无法通过 `rowItems` 删除或重排现有的 row 条目。
- 生成的生产 JSON 不应手工维护；应改为更新源模块或 composition 并重新生成。

关于通用的组合规则和 framework 内部实现，参见 [`framework/README.md`](framework/README.md)。
