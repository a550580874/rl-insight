// The single production composition registry.
//
// Developers register a dashboard here: import (or add) the semantic content
// modules, then add one entry with the aggregate `modules` list and the
// dashboard-level `dashboard` config. Nothing else needs to change; the thin
// `dashboards.jsonnet` entrypoint composes every entry in this registry.
local trainer = import 'dashboards/trainer.libsonnet';
local controller = import 'dashboards/controller.libsonnet';
local storage = import 'dashboards/storage.libsonnet';
local trajectory = import 'dashboards/trajectory.libsonnet';
local vllm = import 'dashboards/vllm.libsonnet';
local sglang = import 'dashboards/sglang.libsonnet';
local npu = import 'dashboards/npu.libsonnet';

// Dashboard-level configuration kept outside reusable content modules.
local productionSpec = {
  annotations: [
    {
      kind: 'AnnotationQuery',
      spec: {
        query: {
          kind: 'DataQuery',
          group: 'grafana',
          version: 'v0',
          spec: {},
        },
        enable: true,
        hide: true,
        iconColor: 'rgba(0, 211, 255, 1)',
        name: 'Annotations & Alerts',
        builtIn: true,
      },
    },
  ],
  cursorSync: 'Crosshair',
  editable: true,
  links: [],
  liveNow: false,
  preload: false,
  timeSettings: {
    timezone: 'browser',
    from: 'now-15m',
    to: 'now',
    autoRefresh: '',
    autoRefreshIntervals: [
      '5s',
      '10s',
      '30s',
      '1m',
      '5m',
      '15m',
      '30m',
      '1h',
      '2h',
      '1d',
    ],
    hideTimepicker: false,
    fiscalYearStartMonth: 0,
  },
};

// Reusable trainer-side content shared by every verl trainer composition.
local verlBase = [trainer, controller, storage, trajectory];

{
  compositions: {
    // The historical `tainer` spelling and the `_jsonnet` suffix are kept on
    // purpose: this dashboard is materialized next to the committed static
    // `verl_tainer_v1_with_vllm_engine.json`, which keeps its own identity.
    verl_tainer_v1_with_vllm_engine_jsonnet: {
      modules: verlBase + [vllm, npu],
      dashboard: {
        metadata: {
          name: '4e42cd18-bffc-491e-8ea6-cd49b6bfd74b',
          generation: 45,
          creationTimestamp: '2026-07-08T14:34:31Z',
          labels: {},
          annotations: {},
        },
        title: 'verl_trainer_v1_with_vllm_engine_jsonnet',
        tags: [
          'RL-Insight',
          'verl',
          'vllm',
        ],
        spec: productionSpec,
        variableOrder: [
          'datasource',
          'project',
          'experiment_name',
          'vllm_model_name',
          'workerid',
          'interval',
          'replica',
          'task_name',
          'op_type',
          'quantile',
          'npu_instance',
        ],
        rowOrder: [
          'rl state timeline',
          'training metric',
          'vllm engine metric',
          'transfer queue metric',
          'hardware metric',
        ],
      },
    },
    // Same split for SGLang: the Jsonnet dashboard is an extra dashboard
    // beside the committed static one, with its own filename and identity.
    verl_tainer_v1_with_sglang_engine_jsonnet: {
      modules: verlBase + [sglang],
      dashboard: {
        metadata: {
          name: '3891c6d0-6872-4d81-953c-fed38cce5383',
          generation: 1,
          creationTimestamp: '2026-07-08T14:34:31Z',
          labels: {},
          annotations: {},
        },
        title: 'verl_trainer_v1_with_sglang_engine_jsonnet',
        tags: [
          'RL-Insight',
          'verl',
          'sglang',
        ],
        spec: productionSpec,
        variableOrder: [
          'datasource',
          'project',
          'experiment_name',
          'sglang_model_name',
          'sglang_replica',
          'task_name',
          'op_type',
          'quantile',
        ],
        rowOrder: [
          'rl state timeline',
          'training metric',
          'sglang engine metric',
          'transfer queue metric',
          'device metric',
        ],
      },
    },
  },
}
