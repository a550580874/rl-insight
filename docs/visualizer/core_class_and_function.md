# Core Class&Function

## 1. BaseVisualizer

`BaseVisualizer` 是所有集群级 Visualizer 的统一抽象基类。

它当前提供的最核心约束包括：

- `input_type`，默认值为 `DataEnum.SUMMARY_EVENT`
- `__init__(config)`，用于接收可视化配置
- 抽象方法 `run(data)`，要求子类实现具体渲染逻辑

这说明 Visualizer 抽象层本身非常轻量，主要负责统一接口，而不在基类中预设复杂流程。

## 2. run() 执行入口

所有具体 Visualizer 都通过 `run(data)` 作为统一执行入口。

从当前实现看：

- `RLTimelineVisualizer.run(data)` 会调用 `generate_rl_timeline(data)`
- `RLTimelinePNGVisualizer.run(data)` 会调用 `generate_rl_timeline_png(data)`

也就是说，Pipeline 不需要感知具体输出细节，只需要调用统一的 `visualizer.run(output_data)` 即可。

## 3. RLTimelineVisualizer

`RLTimelineVisualizer` 使用 `@register_cluster_visualizer("html")` 注册，负责生成 HTML 形式的交互式时间线图。其类注释中也明确说明它对应 HTML / chart timeline，可由配置中的 `vis_type` 选择。

### 3.1 输出形式

`RLTimelineVisualizer` 的默认输出文件名为 `rl_timeline.html`，输出目录优先使用传入参数中的 `output_dir`，否则使用配置中的 `output_path`，再没有则回退到 `"output"`。最终通过 `save_html()` 调用 `fig.write_html(...)` 保存 HTML 文件。

### 3.2 核心处理流程

`generate_rl_timeline()` 的主要流程包括：

1. `load_and_preprocess(input_data)`  
   对输入 `DataFrame` 进行字段重命名、缺失值处理、类型转换，并将时间轴平移到相对时间起点 `t0`

2. `merge_short_events(df)`  
   将同一 `Role`、`Rank ID`、`Name` 下持续时间较短的事件按阈值进行合并，默认阈值为 `10.0 ms`

3. `downsample_if_needed(df)`  
   当记录数超过阈值时执行降采样，默认最大记录数为 `5000`

4. `build_y_mappings(df)`  
   构建 Y 轴标签与位置映射，支持默认顺序和按 `Rank ID` 排序两种映射

5. `build_traces(df, y_mappings["default"])`  
   为不同事件类型构建 Plotly `Bar` trace，并按 `Name` 分配颜色

6. `assemble_figure(...)`  
   组装最终交互式图表，包括标题、坐标轴、图例、hover 模式和交互按钮

7. `save_html(...)`  
   保存 HTML 文件并返回 Figure 对象。

### 3.3 可视化特性

当前 HTML Visualizer 具备以下明显特性：

- 使用 Plotly 生成交互式时间线图
- 标题中显示相对时间原点 `t0`
- 支持 `Hover: Current Only` 与 `Hover: All Ranks` 两种 hover 模式切换
- 支持 `Sort: Default` 与 `Sort: By Rank ID` 两种 Y 轴排序方式
- 按事件类型显示不同颜色图例
- 支持通过 Plotly 模式栏导出图片。

## 4. RLTimelinePNGVisualizer

`RLTimelinePNGVisualizer` 使用 `@register_cluster_visualizer("png")` 注册，负责生成 PNG 静态时间线图。与 HTML 版本相比，它的重点不是交互能力，而是固定布局下的静态图片导出。

### 4.1 输出形式

`RLTimelinePNGVisualizer` 的默认输出文件名为 `rl_timeline.png`。保存时通过 `plotly.io.to_image(...)` 将图表转为 PNG 字节流，再写入目标文件。它支持从配置中读取：

- `output_path`
- `width`
- `scale`

其中默认宽度为 `2000`，默认缩放为 `2`。

### 4.2 核心处理流程

`generate_rl_timeline_png()` 的流程与 HTML 版本总体类似，但在静态图输出上做了不同取舍：

1. `load_and_preprocess(input_data)`  
   完成字段重命名、缺失值处理、时间归一化，并生成 `Start_rel`、`End_rel`

2. `merge_short_events(df)`  
   对短事件进行更细粒度合并，当前默认使用：
   - `duration_threshold_ms = 8.0`
   - `gap_threshold_ms = 2.0`

3. `downsample_if_needed(df)`  
   当点数过多时进行降采样，默认最大点数为 `3000`

4. `build_y_mappings(df)`  
   构建静态图用的 Y 轴位置映射

5. `build_traces(df, y_mappings)`  
   生成用于静态展示的条形图 traces

6. `assemble_static_figure(...)`  
   构建固定布局的 Plotly Figure，设置宽度、高度、背景色、图例、边距和坐标轴

7. `save_png(...)`  
   导出 PNG 文件。

### 4.3 与 HTML 版本的差异

与 `RLTimelineVisualizer` 相比，PNG 版本的主要特点是：

- 输出静态图片，而不是 HTML 交互页面
- 不提供 hover 和按钮切换等交互能力
- 更强调图片尺寸、图例排版和静态展示效果
- 采用不同的时间字段组织方式，如 `Start_rel` 和 `End_rel`
- 使用与 HTML 版本不同的短事件合并与降采样参数。
