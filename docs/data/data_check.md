# 数据校验流程说明

本文主要介绍 RL-Insight 中数据校验（data check）的作用、流程位置、基本机制及其对应的代码结构。

## 1. 作用

RL-Insight 当前支持多种输入数据。
- Torch Profiler 数据
- MSTX（Ascend）Profiling 数据
- summary_event 数据
- VeRL 训练日志

不同数据源的目录结构、文件形式和字段要求不完全相同，为避免不合法输入直接进入后续解析与可视化流程，系统在 pipeline 中引入了统一的数据校验机制。

数据本身的目录布局和字段要求见[`Data Specification and Format Guide`](./data_specification.md)。本文重点说明系统如何对输入和输出数据执行校验，以及对应的代码实现入口。

## 2. Check流程

### 2.1 Check发生位置

Data check 不只发生在 parser 之前，而是发生两次：

1. 在 parser 执行前，对 parser 的输入数据进行校验
2. 在 parser 执行后、visualizer 执行前，对 parser 的输出数据进行校验

整体流程可概括为：

- validate input data
- parser.run(...)
- validate output data
- visualizer.run(...)

因此，data check 在 RL-Insight 中承担的是前后两端数据校验的职责。

### 2.2 Check原理

RL-Insight 的 data check 不是在 pipeline 中直接写死各种判断，而是通过 `Pipeline -> DataChecker -> Rule` 这一条链路来完成。

#### 2.2.1 Check 入口

在 `rl_insight/pipeline/offline_insight_pipeline.py` 的 `run()` 中，第一次 check 发生在 parser 执行之前，对输入内容进行 validate：

`DataChecker(self.input_data_type, self.config.input_path).run()`

这里传入了两个参数：

- `self.input_data_type`：当前输入数据类型
- `self.config.input_path`：当前输入数据对象

也就是说，pipeline 本身并不关心具体要检查哪些文件、字段或内容，它只负责把“数据类型”和“待检查数据”交给 `DataChecker`。

parser 执行完成后，又会发生第二次 check，对输出内容进行 validate：

`DataChecker(self.visualizer.input_type, output_data).run()`

这次传入的是：

- `self.visualizer.input_type`：visualizer 要求的输入数据类型
- `output_data`：parser 的输出结果

#### 2.2.2 DataChecker 的初始化

进入 `DataChecker` 后，首先执行的是 `__init__()`：

- `self.data_type = data_type`
- `self.data = data`

这里没有复杂逻辑，只是把本次校验所需的两个核心信息保存下来：

- 当前这次 check 是针对哪一种数据类型
- 当前这次要校验的数据对象是什么

后续真正的执行发生在 `run()` 中。

#### 2.2.3 DataChecker 的执行流程

`DataChecker` 本身不直接检查“路径是否存在”或“字段是否齐全”，它做的是：

- 根据 `data_type` 找到要执行的ValidationRule
- 按顺序执行这些规则
- 汇总失败信息
- 给出最终结果


`DataChecker.run()` 的执行过程可以拆成下面几步：

1. 初始化一个空的错误列表 `errors = []`
2. 检查当前 `data_type` 是否存在于 `rules` 映射表中
3. 从 `rules[self.data_type]` 中取出当前数据类型对应的规则列表
4. 依次遍历每一条 rule，执行 `rule.check(self.data)`
5. 如果某条 rule 返回 `False`，则把该 rule 的 `error_message` 追加到 `errors`
6. 所有 rule 执行完成后：
   - 如果 `errors` 非空，则抛出 `DataValidationError`
   - 如果 `errors` 为空，则说明本次 check 通过



#### 2.2.4 rules 映射表

`DataChecker` 里定义了一个类属性 `rules`，本质上是一个“数据类型 -> 规则列表”的映射表。

例如：

- `DataEnum.MULTI_JSON_MSTX` 对应：
  - `PathExistsRule()`
  - `MstxJsonFileExistsRule()`
  - `MstxJsonFieldValidRule()`

- `DataEnum.VERL_LOG` 对应：
  - `VerlLogExistRule()`
  - `VerlLogKeyParamsRule()`

- `DataEnum.SUMMARY_EVENT` 对应：
  - `ParserOutputValidatorRule(...)`

 check 到底执行哪些逻辑，根据当前传入的 `data_type` 到这个映射表中查找对应规则列表，获取对应规则：`rules = self.rules[self.data_type]`

 例如，如果传入的是 `DataEnum.MULTI_JSON_MSTX`，那么本次 check 就会依次执行：
  - `PathExistsRule.check(data)`
  - `MstxJsonFileExistsRule.check(data)`
  - `MstxJsonFieldValidRule.check(data)`

具体每个 Rule 的 check 逻辑和内容，可以参考 [3.3 Checker Rule 定义](#33-checker-rule-定义)。

## 3. 关键类定义

Data check 的核心定义位于：

- `rl_insight/data/data_checker.py`
- `rl_insight/data/rules.py`
- `rl_insight/data/verl_log_rules.py`

其中：

### 3.1 `DataChecker`
`DataChecker` 是统一的数据校验入口。初始化时接收两个参数：

- `data_type`
- `data`

运行 `run()` 后，会根据 `data_type` 找到对应规则列表，逐条执行校验。

如果某条规则失败，则收集错误信息；如果存在失败项，则抛出 `DataValidationError`；全部通过时，记录校验成功日志。

### 3.2 `DataEnum`
当前 `DataChecker` 中定义的数据类型包括：

- `MULTI_JSON_MSTX`
- `MULTI_JSON_TORCH`
- `VERL_LOG`
- `SUMMARY_EVENT`
- `UNKNOWN`

其中：
- 前三类主要用于 parser 输入校验
- `SUMMARY_EVENT` 用于 parser 输出 / visualizer 输入校验

### 3.3 Rule

当前 `DataChecker.rules` 中已注册的规则如下：

#### 3.3.1 `MULTI_JSON_MSTX`
- `PathExistsRule`：检查输入对象是否为字符串路径，且该路径存在并且是目录
- `MstxJsonFileExistsRule`：检查输入目录下是否存在 `*_ascend_pt` profiling 目录，以及其中的 `ASCEND_PROFILER_OUTPUT/trace_view.json` 和 `profiler_info_*.json`
- `MstxJsonFieldValidRule`：检查 `trace_view.json` 与 `profiler_info_*.json` 是否非空，并验证关键字段是否齐全。其中：
  - `trace_view.json` 要求事件包含 `ph`、`name`、`pid`、`tid`
  - `profiler_info_*.json` 要求包含 `config`、`start_info`、`end_info`、`torch_npu_version`、`cann_version`、`rank_id`


#### 3.3.2 `MULTI_JSON_TORCH`
- 当前未注册规则

#### 3.3.3 `VERL_LOG`
- `VerlLogExistRule`：检查输入是否为单个合法的 VeRL `.log` 文件，包括路径是否存在、是否为文件而不是目录、后缀是否为 `.log`、文件是否非空，以及文件名或正文中是否能识别为 VeRL 日志
- `VerlLogKeyParamsRule`：在日志文件合法的基础上，进一步检查日志正文中是否包含必需关键字。当前默认关键字包括：
  - `verl`
  - `actor/loss`
  - `critic/score/mean`
  - `critic/rewards/mean`
  - `response_length/mean`
  - `actor/grad_norm`
  - `training/global_step`
  - `training/epoch`
  - `actor/lr`
  - `actor/entropy`
  - `Training Progress:`

#### 3.3.4 `SUMMARY_EVENT`
- `ParserOutputValidatorRule`

- `ParserOutputValidatorRule`：检查 parser 输出是否为非空 `DataFrame`，并且至少包含以下关键列：
  - `role`
  - `name`
  - `rank_id`
  - `start_time_ms`
  - `end_time_ms`

## 4. Input_Data 校验

输入侧校验的目标，是保证传入 parser 的原始数据满足最小可解析要求。

### 4.1 MSTX 数据校验
MSTX 输入当前包含三类检查：

- `PathExistsRule`  
  检查输入对象是否为目录路径，且目录存在

- `MstxJsonFileExistsRule`  
  检查 `*_ascend_pt/ASCEND_PROFILER_OUTPUT/trace_view.json` 是否存在，并检查 `profiler_info_*.json` 是否存在

- `MstxJsonFieldValidRule`  
  检查相关 JSON 文件是否非空，并验证关键字段是否齐全

其中：
- `trace_view.json` 要求事件包含 `ph`、`name`、`pid`、`tid`
- `profiler_info_*.json` 要求包含 `config`、`start_info`、`end_info`、`torch_npu_version`、`cann_version`、`rank_id`

### 4.2 VeRL Log 校验
VeRL 日志输入当前包含两类检查：

- `VerlLogExistRule`
- `VerlLogKeyParamsRule`

其中：
- 输入必须是单个 `.log` 文件，而不是目录
- 文件必须存在且非空
- 文件名或正文中需要能够识别为 VeRL 日志
- 日志正文中需要包含一组必需关键字

当前默认关键字包括：
- `verl`
- `actor/loss`
- `critic/score/mean`
- `critic/rewards/mean`
- `response_length/mean`
- `actor/grad_norm`
- `training/global_step`
- `training/epoch`
- `actor/lr`
- `actor/entropy`
- `Training Progress:`

## 5. Output_data 校验

输出侧校验的目标，是保证 parser 的产出能够被 visualizer 正常消费。

当前 `SUMMARY_EVENT` 类型使用 `ParserOutputValidatorRule` 进行检查，重点包括：

- 输出必须是 `pandas.DataFrame`
- DataFrame 不能为空
- 必须包含关键字段列：
  - `role`
  - `name`
  - `rank_id`
  - `start_time_ms`
  - `end_time_ms`

这说明 RL-Insight 已经把 parser 输出视为一种正式的数据契约，而不是仅依赖 visualizer 在运行时报错。
