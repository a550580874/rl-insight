# Grafana dashboard

> **英文版本：[README.md](README.md)**

RL-Insight 的 Grafana dashboard 以 Jsonnet composition 源的形式随安装包发布：服务启动时 runtime 在进程内把它们渲染进 runtime 目录，并让 Grafana provisioning 指向渲染结果，所以改 dashboard 就是改源文件 —— 任何人都不需要先生成并提交 JSON。包内原有的静态 JSON 同时继续被完整暂存，两类 dashboard 在同一个 Grafana folder 中并列存在。

## 概览

Jsonnet composition 源随安装包发布在 `rl_insight/config/services/grafana/jsonnet/`；包内静态 JSON dashboard 位于 `rl_insight/config/services/grafana/dashboards/`。每次 `rl-insight server start`，runtime 先把静态 dashboard 完整暂存到 runtime 目录，再把 Jsonnet composition 渲染成额外一组 dashboard 放在同一个 Grafana folder 中。二者并存、互不替代：静态 JSON 仍是正式加载的 dashboard 来源。Grafana 只读取 JSON，从不读取 Jsonnet。

| | |
| --- | --- |
| Dashboard 来源 | Jsonnet composition 源：`rl_insight/config/services/grafana/jsonnet/`；包内静态 JSON：`rl_insight/config/services/grafana/dashboards/` |
| 由谁准备 | `rl_insight/server/runtime.py`：每次 `rl-insight server start` 先完整暂存静态 JSON，再把 Jsonnet 渲染到它们旁边 |
| 依赖 | `rjsonnet`，一个普通的 Python 依赖，随 `rl-insight` 一起安装 —— 不需要 Jsonnet CLI、不需要 Go、不需要编译器 |
| 包内静态 JSON 的作用 | 随包发布的正式 dashboard，启动时按原样暂存；Jsonnet 渲染只在它旁边新增文件 |

内容被拆分为可复用模块（某个子系统的 panels、rows、variables）和一个 composition registry，后者声明一个 dashboard 由哪些模块组成。运行时把它们合并为完整的 Grafana dashboard。

```text
rl_insight/config/services/grafana/jsonnet/
├── dashboards.jsonnet                    薄入口：组合 registry 中的每个条目
├── dashboard_compositions.libsonnet      唯一的生产 composition registry
├── dashboards/                           子系统内容模块
│   ├── trainer.libsonnet  controller.libsonnet  storage.libsonnet  trajectory.libsonnet
│   └── vllm.libsonnet  sglang.libsonnet  npu.libsonnet
└── framework/                            通用 composer + 可视化默认值
    ├── composer.libsonnet
    └── viz.libsonnet
```

与这些源文件配套的工具目录只有三个文件：

```text
tools/grafana/framework/
├── README.md           英文版本
├── README.zh-CN.md     本文件
└── generate.py         包内 renderer 之上的可选薄封装 CLI
```

### Jsonnet 源文件

| 文件 | 用途 | 通常由谁修改 |
| --- | --- | --- |
| `dashboard_compositions.libsonnet` | 生产 registry：每个 dashboard 的 `modules`，以及 dashboard 级 metadata、title、tags 与顺序 | Dashboard 开发者 —— 最常修改的文件 |
| `dashboards/*.libsonnet` | 某个子系统的可复用 panels、rows 与 variables | 新增或修改该监控内容的人 |
| `dashboards.jsonnet` | 稳定的生产入口：import registry 并 compose 所有已注册 dashboard | 通常不需要修改 |
| `framework/composer.libsonnet` | 所有 dashboard 共享的通用 composition 语义 | 普通 dashboard 开发者不修改 |
| `framework/viz.libsonnet` | 通用可视化默认值 | 仅在 framework 级可视化变更时修改 |

### 默认启动结果

如果只是使用现有 dashboard，不需要修改任何配置：

```bash
rl-insight server start
```

启动后 `<runtime_dir>/dashboards/verl/` 会同时包含四个 dashboard：

```text
<runtime_dir>/dashboards/verl/
├── verl_tainer_v1_with_vllm_engine.json            包内静态 JSON
├── verl_tainer_v1_with_sglang_engine.json          包内静态 JSON
├── verl_tainer_v1_with_vllm_engine_jsonnet.json    启动时自动生成
└── verl_tainer_v1_with_sglang_engine_jsonnet.json  启动时自动生成
```

前两个是包内静态 JSON 原样暂存，后两个是启动时由 Jsonnet 自动生成的额外 dashboard。Grafana provisioning 扫描整个 `<runtime_dir>/dashboards/`（`foldersFromFilesStructure=true`），因此四个 dashboard 都会被加载，用户可以在 Grafana 中同时打开原版和 Jsonnet 版；Jsonnet 版 title 带 `_jsonnet` 后缀，便于在 Grafana UI 中区分。

`verl/` 之外的其他自带目录（`quick_start_demo`、`agent_loop_trajectory`、`verl-omni`）同样随包发布，并继续被暂存和加载。

## Dashboard 开发者使用场景

每一个场景都是对随安装包发布的 Jsonnet 源文件做配置改动。改动后继续正常的 RL-Insight 开发/启动流程即可 —— dashboard 会在启动时自动 materialize（不需要手工 generate）。

### 1. 复用现有模块新增 dashboard

在 `dashboard_compositions.libsonnet` 中加一个条目，其余都不用改。

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

随后继续正常的 RL-Insight 开发/启动流程 —— dashboard 会在启动时自动 materialize。

### 2. 新增 Foo engine 或其他新内容模块

1. 新增 `dashboards/foo.libsonnet`，写入该子系统的 panels、rows 与 variables。
2. 在 `dashboard_compositions.libsonnet` 中 import 并注册一个 composition：

```jsonnet
verl_tainer_v1_with_foo_engine_jsonnet: {
  modules: verlBase + [foo],
  dashboard: { ... },
},
```

registry key 就是输出文件名，`_jsonnet` 后缀是内置 composition 的命名约定，用来避免与它旁边已有的静态 dashboard 冲突；全新的 engine 没有对应的静态 dashboard，只要名字未被占用即可。

3. 只有新增共享可视化类型或新增 composition 行为时，才需要改 `framework/` 里的通用资产。普通 dashboard 永远不需要改。

随后继续正常的 RL-Insight 开发/启动流程 —— dashboard 会在启动时自动 materialize。

### 3. 用附属模块扩展已有 dashboard

保持 `trainer` 不变，在它旁边增加一个附属模块。`trainer_extra` 自己拥有新增的 panel 以及渲染它的 row；composition 里加上这个模块，并把新 row 写进 `rowOrder`。

```jsonnet
// dashboards/trainer_extra.libsonnet —— trainer dashboard 的额外内容
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
        // ... dashboard 级配置保持不变
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

`rowItems` 是另一种增量形式：它把条目追加到 composition 已经渲染为 `GridLayout` row 的 row 上，因此不必把该 row 再写进 `rowOrder`。两种方式下扩展都无法隐式覆盖已有的 panel、row 或 variable —— row 扩展规则见本文档的「Framework 内部机制」一节。

随后继续正常的 RL-Insight 开发/启动流程 —— dashboard 会在启动时自动 materialize。

### 4. 修改 framework 本身

只有在新增一种可视化类型，或新增 composition 行为本身时，才需要改 `framework/composer.libsonnet` 与 `framework/viz.libsonnet` 这类通用资产。普通 dashboard 的增删改永远不需要动 framework。

framework 的 module 接口、composition 规则、renderer API 与确定性保证见本文档的「Framework 内部机制」一节。

随后继续正常的 RL-Insight 开发/启动流程 —— dashboard 会在启动时自动 materialize。

## 配置文件

三个键都位于服务配置（`rl_insight/config/config.yaml`，或你自己的 `--config` 文件）的 `grafana:` 下。

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `grafana.dashboard_config` | 空 | 要渲染的 Jsonnet composition 配置。为空时渲染包内自带的入口。 |
| `grafana.dashboards_dir` | 包内 `config/services/grafana/dashboards` | 完全替换默认 dashboard 来源的静态 JSON 目录（legacy 模式）。 |
| `grafana.extra_dashboard_dir` | 未设置 | 在 base source 之上合并的额外 JSON dashboard。也可用 `--extra-dashboard-dir` 指定。 |

每次启动时按以下优先级生效：

1. **`dashboard_config` 非空** —— 完整暂存包内静态 dashboard，跳过包内自带的 Jsonnet 入口，只渲染该 Jsonnet 配置并把产物放在静态 dashboard 旁边。文件缺失或 Jsonnet 报错会在 Grafana 启动前停止启动，并在错误信息中给出该配置路径。
2. **`dashboards_dir` 指向包内默认目录以外的位置** —— 只原样复制该目录（legacy/静态模式）：既不暂存包内静态 dashboard，也不运行包内 Jsonnet。这是完全替换默认 dashboard 来源的 legacy 工作流；若配置的目录不存在或不是目录，则停止启动。
3. **否则（默认）** —— 完整暂存包内静态 dashboard，再把包内 Jsonnet 入口渲染成额外 dashboard 放在它们旁边。
4. **`extra_dashboard_dir` 始终最后合并**，叠加在 base source 的产物之上：递归复制、非法路径报错、与已暂存文件同名的 `.json`（无论来自静态 dashboard、Jsonnet 渲染产物还是额外目录）都会导致启动失败。

默认（第 3 种）情况下无需任何配置改动。`dashboard_config` 的语义是替换内置的 Jsonnet composition 集，而不是替换全部自带 dashboard：其他自带目录（`quick_start_demo`、`agent_loop_trajectory`、`verl-omni`）以及 `verl/` 下的静态 dashboard 仍然会被暂存。Jsonnet 渲染是增量写入 —— 它只新增文件，绝不覆盖已暂存的静态 JSON；一旦输出路径与已暂存文件冲突，启动会直接失败。

## 内置 composition

| 模块 | 职责 |
| --- | --- |
| `trainer` | 训练指标：actor、critic、reward、loss、rollout、吞吐、耗时 |
| `controller` | Controller / 编排 / transfer queue 控制指标 |
| `storage` | Partition、存储与数据传输指标 |
| `trajectory` | Tempo / TraceQL 状态时间线 |
| `vllm` | vLLM 推理与宿主侧指标 |
| `sglang` | SGLang 推理指标 |
| `npu` | Ascend NPU 指标 |

共享基础为 `verlBase = [trainer, controller, storage, trajectory]`，已注册的两个生产 composition 为：

```text
verl_tainer_v1_with_vllm_engine_jsonnet   = verlBase + [vllm, npu]
verl_tainer_v1_with_sglang_engine_jsonnet = verlBase + [sglang]
```

`_jsonnet` 后缀同时出现在 registry key、输出文件名和 dashboard title 中，并且 Jsonnet 版本固定使用与静态 dashboard 不同的 `metadata.name`，因此 Grafana 会把两者识别为各自独立的 dashboard。SGLang composition 为 `verlBase + [sglang]`，有意不加入 NPU module —— 它的内容与已有的 SGLang dashboard 保持一致。

新增 dashboard 就是在 registry 里加一个条目；见上面四种开发者场景。

## 用户自定义

使用已安装包的用户只需要这三个键。它们都位于服务配置的 `grafana:` 下。

| 你的需求 | 做法 |
| --- | --- |
| 在不改动安装包的前提下增加 dashboard | 把 `.json` 放进一个目录，用 `--extra-dashboard-dir <dir>`（`grafana.extra_dashboard_dir`）指定。它会最后合并在 base source 之上。 |
| 使用完全不同的 Jsonnet composition | 把 `grafana.dashboard_config` 指向你自己的 composition 配置。它会替换内置的 Jsonnet composition 集（不是全部自带 dashboard）；产物与静态 dashboard 同名时启动失败。 |
| 只用你自己的静态 JSON | 把 `grafana.dashboards_dir` 指向你的目录；它会完全替换默认 dashboard 来源 —— 不再暂存包内静态 dashboard，也不再运行内置 Jsonnet。 |

Dashboard 开发者是另一个角色：他们在仓库里修改 Jsonnet 源文件，这些源文件随安装包一起发布。普通用户不修改 `site-packages`，而是使用上面的三个键。

自定义 `dashboard_config` 是一个独立（standalone）的 Jsonnet 文件。renderer 就在它所在位置求值，不会额外添加任何 import path，因此文件内的 import 相对于该文件解析：要 import 包内的 composer 或模块，必须显式给出路径，例如使用已安装包的绝对路径。

```jsonnet
// 使用下面命令输出的目录：
//   python -c "import rl_insight, pathlib; print(pathlib.Path(rl_insight.__file__).parent)"
local composer = import '<已安装的 rl_insight 目录>/config/services/grafana/jsonnet/framework/composer.libsonnet';
local npu = import '<已安装的 rl_insight 目录>/config/services/grafana/jsonnet/dashboards/npu.libsonnet';

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

形如 `../rl_insight/config/services/grafana/jsonnet/...` 的相对路径只在配置文件位于源码 checkout 内时可用，它不是通用的已安装用户工作流。

它的 dashboard 会渲染到与内置 composition 相同的 `verl` 目录。

## 工作原理

```text
rl-insight server start
        │
        │ PREPARES（准备）—— runtime.py:prepare_files() 调用 _prepare_grafana_dashboards()
        ▼
<runtime_dir>/dashboards  （每次启动都完全重建）
        │
        │ STATIC FIRST（先放静态）—— 包内 dashboard 目录完整暂存，
        │ 包括 verl/ 下的静态 JSON；不跳过、不替换、不删除
        ▼
<runtime_dir>/dashboards/verl/*.json  （静态 dashboard）
        │
        │ JSONNET ALONGSIDE（Jsonnet 并列添加）—— 在进程内渲染包内 Jsonnet
        │ 入口，生成 <dashboard-name>_jsonnet.json 放进同一个 verl/ 目录；
        │ 只新增文件，与已暂存文件同名的输出会直接让启动失败
        ▼
<runtime_dir>/dashboards/verl/*.json  （静态 + Jsonnet 两套 dashboard）
        │
        │ MERGED（合并）—— grafana.extra_dashboard_dir 最后复制到其上
        ▼
<runtime_dir>/dashboards
        │
        │ POINTED AT BY（被指向）—— _render_grafana_provisioning() 写出
        │ provisioning/dashboards/default.yml，其 file provider 的
        │ options.path 指向该目录并启用 foldersFromFilesStructure
        ▼
Grafana
    每个子目录加载为一个 folder，并展示其中的 dashboard
```

渲染在进程内通过 `rl_insight.grafana.renderer`（`rjsonnet.evaluate_file`）完成，从不调用外部进程；运行时只写 `<runtime_dir>`，包内源文件、静态 JSON 和配置都只是只读输入。

`<runtime_dir>` 是服务运行时目录（默认 `~/.rl-insight/runtime`），dashboard 在每次启动时完全重建，因此删除源文件不会残留旧 dashboard。

Jsonnet 渲染是增量写入（`overwrite=False`）—— 它只新增文件，绝不覆盖已暂存的静态 dashboard；一旦输出路径与已暂存文件同名，启动会直接失败，而不是覆盖静态 dashboard。

## Framework 内部机制

这一节面向 framework 贡献者。framework 是一个通用的、与具体 dashboard 无关的极小实现：一个把小型 dashboard 模块组合成一个 dashboard 的 **composer**，以及一个把结果求值成确定性 JSON 的 **renderer**。framework 不认识任何具体 dashboard（没有 engine 名、没有指标名、没有生产路径），也不携带任何 fixture。

### Module 接口

module 是一个普通 Jsonnet object —— 只有数据，没有行为代码：

| 字段 | 必需 | 内容 |
| --- | --- | --- |
| `panels` | 是 | panel 记录列表：`key`、`outputKey`、`id`、`title`、`queries`，以及可选的 `description`、`links`、`vizBase`、`vizPatch`、`transformations`、`queryOptions` |
| `rows` | 否 | 模块**自己拥有**（创建）的具名 `RowsLayoutRow` 规格；grid item 通过 `key` 引用 panel |
| `rowItems` | 否 | `{ <已存在的 row 名>: [GridLayoutItem, ...] }` —— 追加到由其他（或同一个）模块拥有的 row 上的条目；模块本身不创建该 row |
| `variables` | 否 | 具名 variable 规格 |
| `tags` | 否 | 合并进 dashboard tag 列表的标签 |

`vizPatch` 是对 `viz.libsonnet` 中共享默认值做的 RFC 7396 merge patch，因此模块只描述与默认值不同的部分。

### Composition 规则

1. **内容按 module 顺序拼接**；任何东西都不会被隐式覆盖。
2. **冲突是错误而不是覆盖**：重复的 panel `key`、`outputKey` 或 `id`，重复的自有 row 名，或重复的 variable 名，都会以点名冲突条目的错误信息中止求值。
3. **Dashboard 级决策来自 composition config**：`metadata`、`title`、`spec`（时间范围、刷新等 chrome）、`tags`，以及从合并后的模块中挑选并排序 variable 与 row 的 `variableOrder` / `rowOrder`。
4. **顺序引用会被校验**：`variableOrder` 或 `rowOrder` 中没有任何模块提供的条目会中止求值。
5. **Tags** 由 config 的 tags 后接按 composition 顺序排列的 module tags 组成，并按首次出现去重。
6. **引用延迟解析**：layout 通过模块内唯一的 `key` 指向 panel；composer 在渲染时把 `ElementReference` 的 name 改写成 `outputKey`，因此模块之间不需要知道彼此的命名。
7. **`rowItems` 是对已有 row 的追加式扩展**：追加按 module composition 顺序执行（对同一个目标 row，按模块列出的顺序）；目标 row 没有任何模块拥有时报 `unknown row extension target: ...`；目标不是带 `spec.items` 的 `GridLayout` layout 的 `RowsLayoutRow` 时报 `unsupported row extension target: ...` —— 永远不会被静默忽略。

### Renderer API

核心 API 位于 `rl_insight.grafana.renderer`（同时也从 `rl_insight.grafana` 重新导出）：

| 函数 | 用途 |
| --- | --- |
| `render_dashboards(config) -> dict` | 求值该 config，返回 `{ "<dashboard-name>": <dashboard> }` |
| `generated_text(dashboard) -> str` | 对单个 dashboard 做确定性序列化 |
| `materialize_dashboards(config, output_dir)` | 渲染并写出每个 dashboard 对应的 `<dashboard-name>.json` |
| `stale_dashboards(config, expected_dir)` | 返回缺失或与渲染结果逐字节不同的期望文件 |
| `FRAMEWORK_DIR` | 包内持有 `composer.libsonnet` 与 `viz.libsonnet` 的路径 |
| `JsonnetRenderError` | 求值或序列化失败时抛出的异常，消息中带 config 路径与 Jsonnet 栈信息 |

```python
from rl_insight.grafana import renderer

dashboards = renderer.render_dashboards("dashboards/my-service.jsonnet")
renderer.materialize_dashboards("dashboards/my-service.jsonnet", "/tmp/out")
assert renderer.stale_dashboards("dashboards/my-service.jsonnet", "dashboards/expected") == []
```

一个 composition config 求值为 `{ "<dashboard-name>": <dashboard resource> }`，其中每个 resource 都是 `composer.compose(...)` 返回的对象；renderer 为每个名字写出一个 JSON 文件。求值在进程内通过 [`rjsonnet`](https://pypi.org/project/rjsonnet/) binding 完成，它是 `rl-insight` 的基础运行时依赖：`rjsonnet` 为 Windows、macOS 与常见 Linux 架构发布 CPython ABI3 wheel，所以任何平台只要安装 `rl-insight` 就足够 —— 不需要 `jsonnet` CLI、不需要 `go install`、也不需要编译器步骤。

`materialize_dashboards` 的 `overwrite=False` 语义是：先计算全部目标路径，任何一个已存在就一个字节都不写，并在 `JsonnetRenderError` 的错误信息中点名冲突路径。这个检查发生在第一次写入之前，因此冲突永远不会留下只写了一部分的产物。

输出是确定性的：composer 按排序后的顺序输出 object 字段，`generated_text` 使用固定缩进，所以对相同源重复运行必然产出相同的字节。

framework 随包发布，位于安装包内的 `rl_insight/config/services/grafana/jsonnet/framework/`（`composer.libsonnet` 与 `viz.libsonnet`），其绝对位置由 `FRAMEWORK_DIR` 给出；`rl_insight/grafana/renderer.py` 是求值与序列化的唯一实现。

## 可选 CLI

`tools/grafana/framework/generate.py` 是唯一的 CLI，它只是包内 renderer 的薄封装：只负责参数解析与退出码，求值、序列化与 `--check` 比较全部来自 `rl_insight.grafana.renderer`，因此它产出的字节与 `render_dashboards` / `materialize_dashboards` 完全相同，也不会重新实现求值器、不会 shell out 到 Jsonnet CLI、不会调用别的 Python 入口。

```bash
# 渲染：把 <dashboard-name>.json 写入输出目录
python tools/grafana/framework/generate.py \
  --config dashboards/my-service.jsonnet --out-dir /tmp/out

# 校验：与期望文件比较，任何不一致都以 1 退出
python tools/grafana/framework/generate.py \
  --config dashboards/my-service.jsonnet \
  --check --expected-dir dashboards/expected
```

退出码：`0` 成功，`1` `--check` 发现过期文件，`2` config 无法渲染。

这个 CLI 是可选的：普通用户和 dashboard 开发者都不需要它，runtime 也绝不调用它 —— runtime 直接调用 `rl_insight.grafana.renderer`，库的调用方同样直接使用 renderer。

## 长期测试

- `tests/monitor/ut/test_grafana_framework.py` —— 通用 framework 契约：composition 语义（module 顺序、tag 合并与去重、variable 顺序、跨模块引用解析）、冲突检测（重复的 panel `key`/`outputKey`/`id`、重复的自有 row 与 variable 名、未解析的 `variableOrder`/`rowOrder` 条目）、`rowItems` 扩展规则（单扩展、多扩展按 composition 顺序追加、未知目标、非 GridLayout 目标）、渲染与确定性、`overwrite=False` 的预检与冲突原子性、包内 `.libsonnet` 资产随包发布、渲染路径不存在任何 subprocess/CLI 依赖，以及 CLI 只是薄封装（同样字节、同样退出码）。
- `tests/monitor/ut/test_grafana_dashboards.py` —— RL-Insight runtime 集成：不依赖任何 CLI 的自动生成、静态 dashboard 保持逐字节一致、Jsonnet dashboard 拥有独立的 Grafana identity、其他自带 dashboard 继续加载、`dashboard_config` 的接受与拒绝、只写入 runtime 目录，以及 extra / legacy / 冲突 / 过期文件的处理。
- `pre-commit run --all-files` 负责格式与编译检查。

## 限制

- Composition 只能增量叠加，不支持隐式覆盖 panel/row/variable。要修改已有 panel，请改动拥有它的模块。
- `rowItems` 只能把条目追加到 composition 中渲染为 `RowsLayoutRow` 且 layout 为 `GridLayout` 的 row；其他扩展目标会导致求值失败。
- 自定义 `dashboard_config` 是独立（standalone）的 Jsonnet 文件：它必须用显式路径 import 包内的 composer 与模块，不能依赖包被加入任何 import path。
- dashboard 在启动时 materialize，因此 Jsonnet 错误表现为 `rl-insight server start` 失败，而不是 Grafana 中缺少某个 dashboard。
- 包内静态 JSON 是随包发布的产物，按原样加载，不应手工编辑。要改的始终是 Jsonnet 源文件。
