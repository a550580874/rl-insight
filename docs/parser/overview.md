# Overview

## 1. 简介

在 RL-Insight 中，Parser 负责将原始 profiling 数据解析为后续可视化和分析阶段可以直接消费的中间结果。

从系统职责划分上看：

- `Data Specification` 定义输入数据的目录和字段要求
- `DataChecker` 负责在解析前后执行数据校验
- `Parser` 负责把原始数据转换为统一的数据结果
- `Visualizer` 负责消费 Parser 输出并生成最终可视化结果
- `Pipeline` 负责将这些组件组织成完整执行流程

因此，Parser 在系统中承担的是“数据解析与中间结果生成”的职责。

## 2. 代码结构说明

当前 Parser 相关代码位于 `rl_insight/parser` 目录下，主要包括：

- `parser.py`
- `mstx_parser.py`
- `torch_parser.py`

其中：

- `parser.py` 定义了 `BaseClusterParser`、注册机制以及获取 Parser 类的入口
- `mstx_parser.py` 实现了当前已支持的 `MstxClusterParser`
