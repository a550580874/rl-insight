# Grafana dashboard

> **英文版本：[README.md](README.md)**

RL-Insight 的 Grafana dashboard 目前有两种形式并存：安装包里原有的静态 JSON，以及同样随安装包发布的 Jsonnet composition 源。服务启动时，runtime 先把静态 JSON 完整复制到 runtime 目录，再把 Jsonnet 渲染成额外的 dashboard 放在旁边，最后让 Grafana provisioning 指向该目录。改动 dashboard 就是改动源文件 —— 任何人都不需要先生成并提交 JSON。

## 概览

| | |
| --- | --- |
| Dashboard 来源 | 静态 JSON：`rl_insight/config/services/grafana/dashboards/`；Jsonnet composition 源：`rl_insight/config/services/grafana/jsonnet/` |
| 由谁准备 | `rl_insight/server/runtime.py`，在每次 `rl-insight server start` 时：先完整复制静态 JSON，再渲染 Jsonnet |
| Jsonnet 依赖 | `rjsonnet`，一个普通的 Python 依赖 —— 不需要 CLI、不需要 Go、不需要编译器 |
| 两者的关系 | 迁移阶段并存：静态 JSON 仍是正式可加载的 dashboard；Jsonnet 版本是启动时自动生成的额外 dashboard，文件名与 Grafana identity 都与静态版不同 |

内容被拆分为可复用模块（某个子系统的 panels、rows、variables）和一个 composition registry，后者声明一个 dashboard 由哪些模块组成。运行时把它们合并为完整的 Grafana dashboard。

```text
rl_insight/config/services/grafana/jsonnet/
├── dashboards.jsonnet                    薄入口：组合 registry 中的每个条目
├── dashboard_compositions.libsonnet      唯一的生产 composition registry
├── dashboards/
│   ├── trainer.libsonnet  controller.libsonnet  storage.libsonnet  trajectory.libsonnet
│   ├── vllm.libsonnet  sglang.libsonnet  npu.libsonnet
│   └── verify_modules.jsonnet            结构与指纹校验（仅开发使用）
└── framework/                            通用 composer + 可视化默认值
    ├── composer.libsonnet
    └── viz.libsonnet
```

### Jsonnet 源文件

| 文件 | 用途 | 通常由谁修改 |
| --- | --- | --- |
| `dashboard_compositions.libsonnet` | 生产 registry：每个 dashboard 的 `modules`，以及 dashboard 级 metadata、title、tags 与顺序 | Dashboard 开发者 —— 最常修改的文件 |
| `dashboards/*.libsonnet` | 某个子系统的可复用 panels、rows 与 variables | 新增或修改该监控内容的人 |
| `dashboards.jsonnet` | 稳定的生产入口：import registry 并 compose 所有已注册 dashboard | 通常不需要修改 |
| `framework/composer.libsonnet` | 所有 dashboard 共享的通用 composition 语义 | 普通 dashboard 开发者不修改 |
| `framework/viz.libsonnet` | 通用可视化默认值 | 仅在 framework 级可视化变更时修改 |
| `dashboards/verify_modules.jsonnet` | 本次迁移临时的结构/指纹校验文件，计划在合并前删除 | 普通用户不修改 |

## 默认启动结果

如果只是使用现有 dashboard，不需要修改任何配置：

```bash
rl-insight server start
```

启动后 `<runtime_dir>/dashboards/verl/` 会同时包含四个 dashboard：

```text
<runtime_dir>/dashboards/verl/
├── verl_tainer_v1_with_vllm_engine.json            原有静态 JSON
├── verl_tainer_v1_with_sglang_engine.json          原有静态 JSON
├── verl_tainer_v1_with_vllm_engine_jsonnet.json    Jsonnet 自动生成
└── verl_tainer_v1_with_sglang_engine_jsonnet.json  Jsonnet 自动生成
```

前两个是包内原有的静态 JSON 原样复制，后两个是启动时由 Jsonnet 生成的新 dashboard。Grafana provisioning 扫描整个 `<runtime_dir>/dashboards/`（`foldersFromFilesStructure=true`），因此四个 dashboard 都会被加载，用户可以在 Grafana 中同时打开原版和 Jsonnet 版。Jsonnet 版 title 带 `_jsonnet` 后缀，便于在 Grafana UI 中区分。

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

`_jsonnet` 后缀同时出现在 registry key、输出文件名和 dashboard title 中，并且 Jsonnet 版本固定使用与静态 dashboard 不同的 `metadata.name`，因此 Grafana 会把两者识别为各自独立的 dashboard。SGLang Jsonnet 版本保持与已有 SGLang dashboard 内容一致，所以暂未额外加入 NPU module。

新增 dashboard 就是在 registry 里加一个条目；见下面三种开发者场景。

## Dashboard 开发者场景

三种场景都是对随安装包发布的 Jsonnet 源文件做配置改动。改动后继续正常的 RL-Insight 开发/启动流程 —— dashboard 会在启动时自动 materialize。

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

### 2. 新增 Foo engine 或其他新内容

1. 新增 `dashboards/foo.libsonnet`，写入该子系统的 panels、rows 与 variables。
2. 在 `dashboard_compositions.libsonnet` 中 import 并注册一个 composition：

```jsonnet
verl_tainer_v1_with_foo_engine: {
  modules: verlBase + [foo],
  dashboard: { ... },
},
```

3. 只有新增共享可视化类型或新增 composition 行为时，才需要改 `framework/` 里的通用资产。普通 dashboard 永远不需要改。

随后继续正常的 RL-Insight 开发/启动流程 —— dashboard 会在启动时自动 materialize。

### 3. 用 `trainer_extra` 扩展 trainer dashboard

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

`rowItems` 是另一种增量形式：它把条目追加到 composition 已经渲染为 `GridLayout` row 的 row 上，因此不必把该 row 再写进 `rowOrder`。两种方式下扩展都无法隐式覆盖已有的 panel、row 或 variable —— row 扩展规则见 [`framework/README.md`](framework/README.md)。

随后继续正常的 RL-Insight 开发/启动流程 —— dashboard 会在启动时自动 materialize。

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
        │ STATIC FIRST（先放静态）—— 包内 dashboard 目录完整复制，
        │ 包括 verl/ 下的已提交静态 JSON；不跳过、不替换、不删除
        ▼
<runtime_dir>/dashboards/verl/*.json  （静态 dashboard）
        │
        │ JSONNET ALONGSIDE（Jsonnet 并列添加）—— 在进程内渲染包内 Jsonnet
        │ 入口，生成 <dashboard-name>_jsonnet.json；只新增文件，
        │ 与已暂存文件同名的输出会直接让启动失败
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

渲染在进程内通过 `rl_insight.grafana.renderer`（`rjsonnet.evaluate_file`）完成，从不调用外部进程；运行时只写 `<runtime_dir>`，包内源文件、已提交 JSON 和配置都只是只读输入。Jsonnet 渲染是增量写入，因此静态 dashboard 永远不会被覆盖或删除。

`<runtime_dir>` 是服务运行时目录（默认 `~/.rl-insight/runtime`），dashboard 在每次启动时重建，因此删除源文件不会残留旧 dashboard。

### 内部 / 调试

`tools/grafana/generate_dashboards.py` 是同一个 renderer core 之上的可选内部封装。它不属于任何常规流程 —— 普通用户和 dashboard 开发者都不会调用它。它的参数只记录在 `tools/grafana/framework/README.md` 和脚本自身的 `--help` 中。

## 各角色的变化

| 角色 | 有什么变化 | 要做什么 |
| --- | --- | --- |
| RL-Insight / Grafana 用户 | 没有变化 | 像以前一样启动和使用；原来的 dashboard 仍出现在相同的 folder 中，另外多了启动时自动生成的 Jsonnet 版本 |
| Dashboard 开发者 | 仓库里的 Jsonnet 模块或 registry；这些源文件随安装包一起发布 | 继续正常的开发/启动流程 —— 启动时会 materialize 你的改动 |
| 使用额外 dashboard 的用户 | 没有变化 | 继续使用 `--extra-dashboard-dir`；额外 dashboard 会合并在其上 |
| 使用自定义 composition 的用户 | 设置 `grafana.dashboard_config` | 指向你的配置；配置有问题时启动会带清晰错误失败 |

## 限制

- Composition 只能增量叠加，不支持隐式覆盖 panel/row/variable。要修改已有 panel，请改动拥有它的模块。
- `rowItems` 只能把条目追加到 composition 中渲染为 `RowsLayoutRow` 且 layout 为 `GridLayout` 的 row；其他扩展目标会导致求值失败。
- 自定义 `dashboard_config` 是独立（standalone）的 Jsonnet 文件：它必须用显式路径 import 包内的 composer 与模块，不能依赖包被加入任何 import path。
- 仓库中原有的静态 JSON 继续作为正式可加载的 dashboard 保留；Jsonnet 版本作为新增 dashboard 在启动时自动生成，两者在当前迁移阶段并存。请改 Jsonnet 源，而不是手工编辑生成出来的文件。
- Dashboard 在启动时渲染，因此 Jsonnet 错误表现为 `rl-insight server start` 失败，而不是 Grafana 中缺少某个 dashboard。

通用 composition 规则与 framework 内部细节见
[`framework/README.md`](framework/README.md)。
