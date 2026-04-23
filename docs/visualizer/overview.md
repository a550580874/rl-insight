# Overview

## 1. 简介

在 RL-Insight 中，Visualizer 负责消费 Parser 输出的中间结果，并生成最终可视化产物。

从系统职责划分上看：

- `Data Specification` 定义输入数据的目录和字段要求
- `DataChecker` 负责在解析前后执行数据校验
- `Parser` 负责把原始 profiling 数据转换成统一中间结果
- `Visualizer` 负责将中间结果渲染为最终展示结果
- `Pipeline` 负责组织这些组件完成完整执行流程

因此，Visualizer 在系统中承担的是“结果渲染与最终输出生成”的职责。当前 `BaseVisualizer` 默认声明的 `input_type` 为 `DataEnum.SUMMARY_EVENT`，说明 Visualizer 当前面向的输入主要是 Parser 生成的 `summary_event` 类中间数据。

## 2. 代码结构说明

当前 Visualizer 相关代码位于 `rl_insight/visualizer` 目录下，主要包括：

- `visualizer.py`
- `timeline_visualizer.py`

其中：

- `visualizer.py` 定义了 `BaseVisualizer`、注册机制以及获取 Visualizer 类的入口
- `timeline_visualizer.py` 实现了当前已支持的时间线可视化器，包括 HTML 和 PNG 两种输出形式。
