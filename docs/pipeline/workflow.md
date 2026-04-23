# OfflineInsightPipeline Workflow

## 1. 整体流程介绍

`OfflineInsightPipeline.run()` 的核心执行流程如下：

1. 检查输入数据类型是否与 `Parser` 所声明的输入类型一致
2. 使用 `DataChecker` 对输入数据进行校验
3. 调用 `parser.run(input_path)` 执行解析，得到中间输出数据
4. 使用 `DataChecker` 对 `Parser` 输出结果再次进行校验
5. 调用 `visualizer.run(output_data)` 生成最终可视化结果

## 2. 从输入到输出流程

### 2.1 Pipeline 输入

`OfflineInsightPipeline` 依赖配置对象中的以下信息：

- `input_type`
- `input_path`
- `profiler_type`
- `vis_type`
- `rank_list`
- `output_path`

其中：

- `input_type` 用于确定输入数据类型
- `input_path` 用于指定待解析数据路径
- `profiler_type` 用于选择 `Parser`
- `vis_type` 用于选择 `Visualizer`
- `rank_list` 用于构造 `Parser` 配置
- `output_path` 用于构造 `Visualizer` 配置

### 2.2 中间输出

Pipeline 的中间结果来自 `output_data = self.parser.run(self.config.input_path)`。

该结果是 `Parser` 的输出，也是 `Visualizer` 的输入。在进入 `Visualizer` 前，Pipeline 会先对这部分数据执行一次校验。

### 2.3 最终输出

Pipeline 本身不直接生成最终展示内容，而是通过 `self.visualizer.run(output_data)` 将中间结果交由 `Visualizer` 进行最终输出。

因此，从流程上看：

- `Parser` 负责生成中间数据
- `Visualizer` 负责消费中间数据并生成最终结果
- `Pipeline` 负责组织这两个阶段的衔接，并保证数据在进入下一阶段前满足要求
