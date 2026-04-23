# Core Class&Function

## 1. BaseClusterParser

`BaseClusterParser` 是所有集群级 Parser 的统一抽象基类。

它主要完成以下事情：

- 从初始化参数中解析 `rank_list`
- 提供统一的 `run()` 执行入口
- 定义通用的 `mapper_func()` 和 `reducer_func()`
- 约束子类必须实现：
  - `allocate_prof_data()`
  - `parse_analysis_data()`

从职责划分上看：

- `allocate_prof_data()` 负责把输入路径组织成按 rank 分配的数据映射
- `parse_analysis_data()` 负责解析单个 rank 对应的 profiling 数据
- `mapper_func()` 负责调度单 rank 解析，可串行也可并行
- `reducer_func()` 负责把各 rank 的结果聚合成统一 `DataFrame`

## 2. run() 执行入口

`BaseClusterParser.run()` 的执行流程可以概括为：

1. 调用 `allocate_prof_data(input_data)`，为后续解析分配数据
2. 调用 `mapper_func(_data_maps)`，逐个 rank 执行解析
3. 调用 `reducer_func(mapper_res)`，汇总解析结果
4. 返回 `get_data()` 得到最终 `DataFrame`

因此，Parser 的整体流程是一个典型的 map-reduce 式解析过程。

## 3. MstxClusterParser

当前已实现的具体 Parser 是 `MstxClusterParser`，注册名为 `mstx`。

### 3.1 输入类型

`MstxClusterParser` 声明：

- `input_type = DataEnum.MULTI_JSON_MSTX`

这说明它面向的是 MSTX 多 JSON 输入数据。

### 3.2 数据分配逻辑

`allocate_prof_data()` 会递归扫描输入目录，寻找以 `Constant.ASCEND_PROFILER_SUFFIX` 结尾的 profiling 目录，并记录：

- role
- path

随后通过 `_get_data_map()` 和 `_get_rank_path_with_role()` 进一步组织成按 `(task_role, rank_id)` 聚类的数据映射。

其中：

- `rank_id` 主要通过 `profiler_info_*.json` 文件名提取
- `task_role` 优先从 metadata 中读取；如果拿不到，则退回父目录名

最终会构造出带有 `rank_id`、`role`、`profiler_data_path` 的 `DataMap` 列表，供后续并行解析使用。

### 3.3 单 rank 解析逻辑

`parse_analysis_data()` 的核心逻辑是：

1. 读取 `trace_view.json`
2. 找到 `ph == "M"` 且 `args.name == "Overlap Analysis"` 的记录，从中确定目标 `process_id`
3. 再遍历该 `process_id` 下所有 `ph == "X"` 的事件
4. 根据所有有效事件的最小起始时间和最大结束时间，汇总出该 rank 对应 role 的整体时间区间
5. 输出一个统一事件

也就是说，当前 `MstxClusterParser` 并不是把所有原始事件逐条输出，而是将某个 rank / role 对应的 Overlap Analysis 时间范围聚合成一个事件。

### 3.4 输出字段

当前 `MstxClusterParser` 输出的事件字段包括：

- `name`
- `role`
- `domain`
- `start_time_ms`
- `end_time_ms`
- `duration_ms`
- `rank_id`
- `tid`

其中：

- `name` 和 `role` 当前都直接使用传入的 `role`
- `domain` 固定为 `"default"`
- `tid` 使用 `process_id`

时间值通过 `Constant.US_TO_MS` 从原始时间单位转换为毫秒。
