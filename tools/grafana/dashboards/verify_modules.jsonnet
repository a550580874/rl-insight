// Lightweight structural verification for the semantic production modules.
local controller = import 'controller.libsonnet';
local configs = import 'dashboard_configs.libsonnet';
local npu = import 'npu.libsonnet';
local sglang = import 'sglang.libsonnet';
local storage = import 'storage.libsonnet';
local trainer = import 'trainer.libsonnet';
local trajectory = import 'trajectory.libsonnet';
local vllm = import 'vllm.libsonnet';

local sharedModules = [trainer, controller, storage, trajectory];
local objectField(modules, field) =
  std.foldl(
    function(acc, module) acc + (if std.objectHas(module, field) then module[field] else {}),
    modules,
    {}
  );
local panels(modules) = std.flattenArrays([module.panels for module in modules]);
local sortedPanels(items) = std.sort(items, function(item) item.key);
local fingerprint(value) = std.md5(std.manifestJson(value));
local unique(items) = std.length(std.set(items)) == std.length(items);

local sharedPanels = panels(sharedModules);
local sharedRows = objectField(sharedModules, 'rows');
local sharedVariables = objectField(sharedModules, 'variables');
local vllmPanels = vllm.panels + npu.panels;
local vllmRows = vllm.rows + npu.rows;
local vllmVariables = vllm.variables + npu.variables;

assert std.length(sharedPanels) == 116 : 'shared panel count changed';
assert unique([panel.key for panel in sharedPanels]) : 'duplicate shared panel key';
assert unique([panel.outputKey for panel in sharedPanels]) : 'duplicate shared outputKey';
assert unique([panel.id for panel in sharedPanels]) : 'duplicate shared panel id';
assert fingerprint(sortedPanels(sharedPanels)) == '36bd2faec9baf08551d008c1e7e0bfeb'
       : 'shared panel content changed';
assert fingerprint(sharedRows) == '86143182d57394fa90e2477a3059b8b8'
       : 'shared row layout changed';
assert fingerprint(sharedVariables) == '9e931b598a5dbea59946ec2872a6e345'
       : 'shared variables changed';

assert std.length(vllm.panels) == 22 : 'vLLM non-NPU panel count changed';
assert std.length(npu.panels) == 8 : 'NPU panel count changed';
assert std.length(vllmPanels) == 30 : 'combined vLLM panel count changed';
assert unique([panel.key for panel in vllmPanels]) : 'duplicate vLLM/NPU panel key';
assert unique([panel.outputKey for panel in vllmPanels]) : 'duplicate vLLM/NPU outputKey';
assert unique([panel.id for panel in vllmPanels]) : 'duplicate vLLM/NPU panel id';
assert fingerprint(sortedPanels(vllmPanels)) == 'c6ff65eec14b579a8c4b725a60211b20'
       : 'vLLM/NPU panel content changed';
assert fingerprint(vllmRows) == '880ddbbd20f02e73e5dad2680a9df225'
       : 'vLLM row layout changed';
assert fingerprint(vllmVariables) == '24ddbd0b82b40730ba5dbcbf13ea58e5'
       : 'vLLM/NPU variables changed';

assert std.length(sglang.panels) == 8 : 'SGLang panel count changed';
assert fingerprint(sortedPanels(sglang.panels)) == '6648f8760711149085da7f370872aa88'
       : 'SGLang panel content changed';
assert fingerprint(sglang.rows) == 'aab69f1cfd88bbcc94190075c657f33d'
       : 'SGLang row layout changed';
assert fingerprint(sglang.variables) == '70d60ff7ccb33170c0b53f19140d5f21'
       : 'SGLang variables changed';
assert fingerprint(configs) == 'aaca26665ba894b549ca5b7b238624d5'
       : 'dashboard metadata, chrome, or ordering changed';

{
  modules: {
    trainer: { panels: std.length(trainer.panels), rows: std.length(std.objectFields(trainer.rows)), variables: std.length(std.objectFields(trainer.variables)) },
    controller: { panels: std.length(controller.panels), rows: std.length(std.objectFields(controller.rows)), variables: std.length(std.objectFields(controller.variables)) },
    storage: { panels: std.length(storage.panels), rows: std.length(std.objectFields(storage.rows)), variables: std.length(std.objectFields(storage.variables)) },
    trajectory: { panels: std.length(trajectory.panels), rows: std.length(std.objectFields(trajectory.rows)), variables: std.length(std.objectFields(trajectory.variables)) },
    vllm: { panels: std.length(vllm.panels), rows: std.length(std.objectFields(vllm.rows)), variables: std.length(std.objectFields(vllm.variables)) },
    sglang: { panels: std.length(sglang.panels), rows: std.length(std.objectFields(sglang.rows)), variables: std.length(std.objectFields(sglang.variables)) },
    npu: { panels: std.length(npu.panels), rows: std.length(std.objectFields(npu.rows)), variables: std.length(std.objectFields(npu.variables)) },
  },
  totals: {
    sharedPanels: std.length(sharedPanels),
    vllmPanels: std.length(vllmPanels),
    sglangPanels: std.length(sglang.panels),
  },
}
