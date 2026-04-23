# Visualizer Workflow

## 1. Visualizer 调用入口

在 `OfflineInsightPipeline` 中，Visualizer 由 `get_cluster_visualizer_cls(self.config.vis_type)` 动态获取并实例化；实例化时会接收由 `_prepare_visualizer_config()` 构造的配置，当前重点包括 `output_path`。

Pipeline 在完成 Parser 输出校验后，通过 `visualizer.run(output_data)` 触发最终渲染。

## 2. 输入数据要求

当前两个具体 Visualizer 都声明：

- `input_type = DataEnum.SUMMARY_EVENT`

这说明它们的输入都应为 `summary_event` 形式的中间结果。

从 `timeline_visualizer.py` 的预处理逻辑看，输入数据应至少包含以下列：

- `role`
- `name`
- `rank_id`
- `start_time_ms`
- `end_time_ms`

在进入绘图逻辑前，这些列会被重命名为：

- `Role`
- `Name`
- `Rank ID`
- `Start`
- `Finish`

并进一步执行类型转换、缺失值过滤和合法性检查，例如要求结束时间大于开始时间。

## 3. Visualizer 类型选择

Visualizer 的具体实现由 `self.config.vis_type` 决定，并通过 `get_cluster_visualizer_cls(self.config.vis_type)` 动态获取。

当前已支持的类型包括：

- `html`：对应 `RLTimelineVisualizer`
- `png`：对应 `RLTimelinePNGVisualizer`

也就是说，当 `vis_type` 为 `html` 时，会使用 `RLTimelineVisualizer` 生成 HTML 形式的交互式时间线图；当 `vis_type` 为 `png` 时，会使用 `RLTimelinePNGVisualizer` 生成 PNG 静态时间线图。

## 4. 处理流程与输出

Visualizer 选定后，会通过统一入口 `visualizer.run(output_data)` 执行。

如果使用 `RLTimelineVisualizer`，处理流程会进入 `generate_rl_timeline(data)`，完成数据预处理、短事件合并、降采样、Y 轴映射、trace 构建、figure 组装，并最终保存为 `rl_timeline.html`。

如果使用 `RLTimelinePNGVisualizer`，处理流程会进入 `generate_rl_timeline_png(data)`，完成数据预处理、短事件合并、降采样、静态图布局构建，并最终保存为 `rl_timeline.png`。
