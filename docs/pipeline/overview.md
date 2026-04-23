# OfflineInsightPipeline Overview

## 1. 简介

在 RL-Insight 中，离线分析流程由 `OfflineInsightPipeline` 统一组织。该 Pipeline 不直接实现 profiling 数据解析或可视化逻辑，而是负责根据配置完成 `Parser`、`DataChecker` 和 `Visualizer` 的组装与调度。

其主要职责是将“输入数据校验 -> 数据解析 -> 输出数据校验 -> 可视化输出”串联成一次完整的离线分析流程。


`OfflineInsightPipeline` 的主要作用包括：

- 根据配置确定输入数据类型
- 根据配置选择对应的 `Parser`
- 根据配置选择对应的 `Visualizer`
- 在 `Parser` 执行前后分别执行数据校验
- 将 `Parser` 输出交给 `Visualizer` 完成最终结果生成

因此，Pipeline 更偏“流程控制层”，而不是具体的数据处理实现层。

## 2. 代码结构说明

当前离线 Pipeline 的核心代码位于：

- `rl_insight/pipeline/offline_insight_pipeline.py`

其中关键方法包括：

- `__init__()`：初始化输入数据类型、`Parser` 和 `Visualizer`
- `_prepare_parser_config()`：构造 `Parser` 配置
- `_prepare_visualizer_config()`：构造 `Visualizer` 配置
- `run()`：执行完整的离线分析流程

## 3. Pipeline 及其组件协作方式

从系统职责划分上看：

- `Data Specification` 定义输入数据的目录和字段要求
- `Data Check` 负责对输入和中间结果执行合法性校验
- `Parser` 负责将原始数据解析成统一的中间结果
- `Visualizer` 负责将中间结果渲染为最终输出
- `Pipeline` 负责把这些部分连接起来

因此，Pipeline 在系统中承担的是“流程编排”和“组件协作”的职责。

### 3.1 Parser

`Parser` 由 `parser_cls = get_cluster_parser_cls(self.config.profiler_type)` 动态获取，并在初始化时接收 `parser_config`。当前 `Parser` 配置主要由 `_prepare_parser_config()` 生成，内容包括 `rank_list`。

`Parser` 的职责是将输入路径对应的 profiling 数据解析成统一的中间结果。

### 3.2 Visualizer

`Visualizer` 由 `visualizer_cls = get_cluster_visualizer_cls(self.config.vis_type)` 动态获取，并在初始化时接收 `visualizer_config`。当前 `Visualizer` 配置主要由 `_prepare_visualizer_config()` 生成，内容包括 `output_path`。

`Visualizer` 的职责是消费 `Parser` 输出并生成最终可视化结果。

### 3.3 DataChecker

Pipeline 中的 `DataChecker` 负责执行两次数据校验：

- 输入校验：保证原始输入满足 `Parser` 要求
- 输出校验：保证 `Parser` 产出满足 `Visualizer` 要求

因此，`DataChecker` 在 Pipeline 中承担的是“数据契约守卫”的角色。

### 3.4 Pipeline

Pipeline 自身不实现具体解析规则，也不实现具体渲染逻辑；它负责：

- 选择组件
- 组织配置
- 控制执行顺序
- 在组件之间传递数据
- 在关键节点执行校验
