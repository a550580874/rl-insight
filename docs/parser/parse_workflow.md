# Parse Workflow

## 1. 数据分配阶段

Parser 首先通过 `allocate_prof_data()` 扫描输入路径，构造一组 `DataMap`。根据基类文档约定，每个 `DataMap` 至少应包含：

- `rank_id`
- `role`
- `profiler_data_path`

这一步的目标是把原始输入目录转换成“每个 rank 对应一个可解析数据单元”的形式。

## 2. 单 rank 解析阶段

在 `mapper_func()` 中：

- 如果没有数据，直接返回空列表
- 如果只有一个 rank，走串行处理
- 如果有多个 rank，则使用 `ProcessPoolExecutor` 并行处理

并行度会根据 rank 数量和 CPU 核数自动确定。每个 rank 的解析最终都会调用 `_mapper_func()`，再由 `_mapper_func()` 调用子类实现的 `parse_analysis_data()`。

因此，真正的“单个 rank 的解析逻辑”由具体 Parser 子类决定。

## 3. 结果聚合阶段

`reducer_func()` 会将各 rank 返回的结果统一展开并合并。

这里要求 `parse_analysis_data()` 返回值必须是 `list[dict]` 或空列表；如果类型不符合，会直接抛出 `TypeError`。

聚合后结果会按 `start_time_ms` 排序，并最终存入 `self.events_summary`，类型为 `pandas.DataFrame`。
