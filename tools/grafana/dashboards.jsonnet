local common = import 'dashboards/common.libsonnet';
local dashboard = import 'dashboards/base/dashboard.libsonnet';

{
  vllm: dashboard.build(common, import 'dashboards/vllm.libsonnet'),
  sglang: dashboard.build(common, import 'dashboards/sglang.libsonnet'),
}
