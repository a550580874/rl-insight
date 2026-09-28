# Grafana dashboard

> **英文版本：[README.md](README.md)**

RL-Insight 的 Grafana dashboard 以 Jsonnet composition 源的形式随安装包一起发布。服务启动时把它们渲染到 runtime 目录，并让 Grafana provisioning 指向该目录；因此改动 dashboard 就是改动源文件 —— 任何人都不需要先生成并提交 JSON。

## 概览

| | |
| --- | --- |
| 事实来源 | 安装包内的 `rl_insight/config/services/grafana/jsonnet/` |
| 由谁渲染 | `rl_insight/server/runtime.py`，在每次 `rl-insight server start` 时 |
| Jsonnet 依赖 | `rjsonnet`，一个普通的 Python 依赖 —— 不需要 CLI、不需要 Go、不需要编译器 |
| 已提交 JSON | `rl_insight/config/services/grafana/dashboards/` —— 保留为语义 baseline/reference，不再是运行时来源 |

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

## 配置文件

三个键都位于服务配置（`rl_insight/config/config.yaml`，或你自己的 `--config` 文件）的 `grafana:` 下。

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `grafana.dashboard_config` | 空 | 要渲染的 Jsonnet composition 配置。为空时渲染包内自带的入口。 |
| `grafana.dashboards_dir` | 包内 `config/services/grafana/dashboards` | 不渲染、改为复制的静态 JSON 目录。 |
| `grafana.extra_dashboard_dir` | 未设置 | 在 base source 之上合并的额外 JSON dashboard。也可用 `--extra-dashboard-dir` 指定。 |

每次启动时按以下优先级生效：

1. **`dashboard_config` 非空** —— 渲染该 Jsonnet 配置。文件缺失或 Jsonnet 报错会在 Grafana 启动前停止启动，并在错误信息中给出该配置路径。
2. **`dashboards_dir` 指向包内默认目录以外的位置** —— 原样复制该目录。这是 legacy 静态工作流；若配置的目录不存在或不是目录，则停止启动。
3. **否则** —— 渲染随安装包一起发布的 Jsonnet 入口。
4. **`extra_dashboard_dir` 始终最后合并**，叠加在 base source 的产物之上：递归复制、非法路径报错、与已暂存文件同名的 `.json` 会导致启动失败。

第 1 和第 3 种情况下，包内自带的 dashboard 会先被暂存，渲染结果再覆盖 `verl` 目录，因此所有自带 dashboard 仍然被提供，Grafana 显示的目录结构与之前完全一致，而属于 Jsonnet 的文件始终是最新渲染的结果。

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
verl_tainer_v1_with_vllm_engine   = verlBase + [vllm, npu]
verl_tainer_v1_with_sglang_engine = verlBase + [sglang]
```

新增 dashboard 就是在 registry 里加一个条目；见下面三种开发者场景。

## Dashboard 开发者场景

三种场景都只是改源文件。没有“生成并提交”的步骤，也没有需要记住的命令 —— 下一次 `rl-insight server start` 就会渲染包内的当前内容。

### 1. 仅用现有模块新增 dashboard

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

### 2. 新增 engine 或新增内容

1. 新增 `dashboards/foo.libsonnet`，写入该子系统的 panels、rows 与 variables。
2. 在 `dashboard_compositions.libsonnet` 中 import 并注册一个 composition：

```jsonnet
verl_tainer_v1_with_foo_engine: {
  modules: verlBase + [foo],
  dashboard: { ... },
},
```

3. 只有新增共享可视化类型或新增 composition 行为时，才需要改 `framework/` 里的通用资产。普通 dashboard 永远不需要改。

### 3. 扩展现有内容

复用某个模块并在其上追加内容。扩展是纯增量的：扩展不能隐式覆盖已有的 panel、row 或 variable。

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

扩展自己拥有一个完整新区块时用 `rows`；向其它模块已创建的 row 追加 panel 时用 `rowItems`。

## 用户自定义

| 你的需求 | 做法 |
| --- | --- |
| 在不改动安装包的前提下增加 dashboard | 把 `.json` 放进一个目录，用 `--extra-dashboard-dir <dir>` 指定。它会合并到内置 dashboard 之上。 |
| 使用完全不同的 Jsonnet composition | 把 `grafana.dashboard_config` 指向你自己的 composition 配置。它会替换内置的 Jsonnet 层；无法渲染时启动失败。 |
| 只用你自己的静态 JSON | 把 `grafana.dashboards_dir` 指向你的目录；它会替换内置渲染。 |
| 在项目本地安装中修改内置 dashboard | 直接改包内源文件（见开发者场景），然后重启服务栈。 |

自定义 `dashboard_config` 可以用相对于其所在目录的路径 import 包内的 framework 与模块：

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

它的 dashboard 会渲染到与内置 composition 相同的 `verl` 目录。

## 工作原理

```text
rl-insight server start
        │
        │ PREPARES（准备）—— runtime.py:prepare_files() 调用 _prepare_grafana_dashboards()
        ▼
<runtime_dir>/dashboards  （每次启动都完全重建）
        │
        │ BASE SOURCE（基础来源）—— 要么是自带 dashboard 加一次 Jsonnet 渲染，
        │ 要么是 grafana.dashboards_dir 的 legacy 静态复制
        ▼
<runtime_dir>/dashboards/verl/*.json  （渲染出的 <dashboard-name>.json）
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

渲染在进程内通过 `rl_insight.grafana.renderer`（`rjsonnet.evaluate_file`）完成，从不调用外部进程；运行时只写 `<runtime_dir>`，包内源文件、已提交 JSON 和配置都只是只读输入。

`<runtime_dir>` 是服务运行时目录（默认 `~/.rl-insight/runtime`），dashboard 在每次启动时重建，因此删除源文件不会残留旧 dashboard。

### 内部 / 调试

`tools/grafana/generate_dashboards.py` 是同一个 renderer core 之上的可选薄封装。它不属于任何常规流程，只用于刷新已提交 JSON baseline 以及在 CI 中校验：

```bash
python tools/grafana/generate_dashboards.py            # 刷新 baseline
python tools/grafana/generate_dashboards.py --check    # 语义漂移时退出码 1
```

`--check` 比较解析后的 JSON 对象，因此仅序列化顺序不同不会被误判。

## 各角色的变化

| 角色 | 有什么变化 | 要做什么 |
| --- | --- | --- |
| RL-Insight / Grafana 用户 | 没有变化 | 像以前一样启动和使用；相同的 dashboard 仍出现在相同的 folder 中 |
| Dashboard 开发者 | 改包内的 Jsonnet 模块或 registry | 重启服务栈 —— 启动时会渲染你的改动 |
| 使用额外 dashboard 的用户 | 没有变化 | 继续使用 `--extra-dashboard-dir`；额外 dashboard 会合并在其上 |
| 使用自定义 composition 的用户 | 设置 `grafana.dashboard_config` | 指向你的配置；配置有问题时启动会带清晰错误失败 |

## 限制

- Composition 只能增量叠加，不支持隐式覆盖 panel/row/variable。要修改已有 panel，请改动拥有它的模块。
- `rowItems` 只能向已存在且受支持的 `GridLayout` row 追加条目。
- 自定义 `dashboard_config` 是普通 Jsonnet 文件，因此 import 包内 framework 与模块时必须使用相对于该文件的路径。
- 已提交 JSON 是用于评审与 CI 的 baseline/reference，不是运行时来源；请改 Jsonnet 源而不是生成出来的文件。
- Dashboard 在启动时渲染，因此 Jsonnet 错误表现为 `rl-insight server start` 失败，而不是 Grafana 中缺少某个 dashboard。

通用 composition 规则与 framework 内部细节见
[`framework/README.md`](framework/README.md)。
