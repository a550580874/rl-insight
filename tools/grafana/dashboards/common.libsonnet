// Shared by the vLLM and SGLang dashboards.
{
  spec: {
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
  },
  panels: [
    {
      key: 'trajectory.metric.state_timeline',
      outputKey: 'panel-40',
      id: 40,
      title: 'state timeline',
      queries: [
        {
          raw: {
            kind: 'DataQuery',
            group: 'tempo',
            version: 'v0',
            spec: {
              limit: 10000,
              metricsQueryType: 'range',
              query: '{span.state_lane_id!=""}',
              queryType: 'traceql',
              serviceMapUseNativeHistograms: false,
              spss: 100,
              tableType: 'spans',
            },
          },
        },
      ],
      transformations: [
        {
          kind: 'Transformation',
          group: 'calculateField',
          spec: {
            options: {
              binary: {
                left: {
                  matcher: {
                    id: 'byName',
                    options: 'Duration',
                  },
                },
                operator: '/',
                right: {
                  fixed: '1000000',
                },
              },
              mode: 'binary',
              reduce: {
                reducer: 'sum',
              },
            },
          },
        },
        {
          kind: 'Transformation',
          group: 'calculateField',
          spec: {
            options: {
              alias: 'End time',
              mode: 'reduceRow',
              reduce: {
                include: [
                  'Start time',
                  'Duration / 1000000',
                ],
                reducer: 'sum',
              },
            },
          },
        },
        {
          kind: 'Transformation',
          group: 'extractFields',
          spec: {
            options: {
              source: 'state_lane_id',
              format: 'regexp',
              replace: false,
              regExp: '/^(?<state_lane_prefix>.+?)(?:[_-](?<state_lane_num>\\d+))?$/',
            },
          },
        },
        {
          kind: 'Transformation',
          group: 'convertFieldType',
          spec: {
            options: {
              conversions: [
                {
                  destinationType: 'time',
                  targetField: 'Start time',
                },
                {
                  destinationType: 'time',
                  targetField: 'End time',
                },
                {
                  destinationType: 'number',
                  targetField: 'state_lane_num',
                },
              ],
              fields: {},
            },
          },
        },
        {
          kind: 'Transformation',
          group: 'sortBy',
          spec: {
            options: {
              fields: {},
              sort: [
                {
                  field: 'state_lane_num',
                },
              ],
            },
          },
        },
        {
          kind: 'Transformation',
          group: 'sortBy',
          spec: {
            options: {
              fields: {},
              sort: [
                {
                  field: 'state_lane_prefix',
                },
              ],
            },
          },
        },
        {
          kind: 'Transformation',
          group: 'organize',
          spec: {
            options: {
              excludeByName: {
                Duration: true,
                'Duration / 1000000': true,
                Name: true,
                'Span ID': true,
                'Trace Service': true,
                traceIdHidden: true,
                state_lane_prefix: true,
                state_lane_num: true,
              },
              includeByName: {},
              indexByName: {},
              renameByName: {},
            },
          },
        },
        {
          kind: 'Transformation',
          group: 'partitionByValues',
          spec: {
            options: {
              fields: [
                'state_lane_id',
              ],
              keepFields: false,
            },
          },
        },
      ],
      vizBase: 'state-timeline',
    },
    {
      key: 'training.actor.actor_entropy',
      outputKey: 'panel-184',
      id: 184,
      title: 'actor_entropy',
      queries: [
        {
          expr: 'rl_insight_monitor_actor_entropy{project=~"$project", experiment_name=~"$experiment_name"}',
          extra: {
            instant: false,
          },
        },
      ],
    },
    {
      key: 'training.critic.critic_score_max',
      outputKey: 'panel-207',
      id: 207,
      title: 'critic_score_max',
      queries: [
        {
          expr: 'rl_insight_monitor_critic_score_max{project=~"$project", experiment_name=~"$experiment_name"}',
        },
      ],
      vizPatch: {
        version: '13.0.1',
      },
    },
    {
      key: 'training.critic.critic_score_mean',
      outputKey: 'panel-208',
      id: 208,
      title: 'critic_score_mean',
      queries: [
        {
          expr: 'rl_insight_monitor_critic_score_mean{project=~"$project", experiment_name=~"$experiment_name"}',
        },
      ],
      vizPatch: {
        version: '13.0.1',
      },
    },
    {
      key: 'training.critic.critic_score_min',
      outputKey: 'panel-209',
      id: 209,
      title: 'critic_score_min',
      queries: [
        {
          expr: 'rl_insight_monitor_critic_score_min{project=~"$project", experiment_name=~"$experiment_name"}',
        },
      ],
      vizPatch: {
        version: '13.0.1',
      },
    },
    {
      key: 'training.training.training_epoch',
      outputKey: 'panel-283',
      id: 283,
      title: 'training_epoch',
      queries: [
        {
          expr: 'rl_insight_monitor_training_epoch{project=~"$project", experiment_name=~"$experiment_name"}',
        },
      ],
      vizBase: 'gauge',
    },
    {
      key: 'training.training.training_global_step',
      outputKey: 'panel-284',
      id: 284,
      title: 'training_global_step',
      queries: [
        {
          expr: 'rl_insight_monitor_training_global_step{project=~"$project", experiment_name=~"$experiment_name"}',
        },
      ],
      vizBase: 'gauge',
    },
    {
      key: 'controller.controller_overview.controller_uptime',
      outputKey: 'panel-295',
      id: 295,
      title: 'Controller Uptime',
      queries: [
        {
          expr: 'tq_controller_uptime_seconds',
          editorMode: 'code',
          legend: '',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizBase: 'stat',
    },
    {
      key: 'controller.controller_overview.controller_rss_memory',
      outputKey: 'panel-296',
      id: 296,
      title: 'Controller RSS Memory',
      queries: [
        {
          expr: 'tq_controller_memory_rss_bytes',
          editorMode: 'code',
          legend: '',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizBase: 'stat',
      vizPatch: {
        spec: {
          options: {
            graphMode: 'area',
          },
          fieldConfig: {
            defaults: {
              unit: 'bytes',
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                  {
                    value: 2147483648,
                    color: 'yellow',
                  },
                  {
                    value: 4294967296,
                    color: 'red',
                  },
                ],
              },
            },
          },
        },
      },
    },
    {
      key: 'controller.controller_overview.active_partitions',
      outputKey: 'panel-297',
      id: 297,
      title: 'Active Partitions',
      queries: [
        {
          expr: 'tq_partitions_total',
          editorMode: 'code',
          legend: '',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizBase: 'stat',
      vizPatch: {
        spec: {
          fieldConfig: {
            defaults: {
              unit: null,
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'blue',
                  },
                ],
              },
            },
          },
        },
      },
    },
    {
      key: 'controller.controller_overview.global_indexes_allocated',
      outputKey: 'panel-298',
      id: 298,
      title: 'Global Indexes Allocated',
      queries: [
        {
          expr: 'tq_global_index_allocated_total',
          editorMode: 'code',
          legend: '',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizBase: 'stat',
      vizPatch: {
        spec: {
          fieldConfig: {
            defaults: {
              unit: null,
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'purple',
                  },
                ],
              },
            },
          },
        },
      },
    },
    {
      key: 'controller.controller_overview.reusable_indexes',
      outputKey: 'panel-299',
      id: 299,
      title: 'Reusable Indexes',
      queries: [
        {
          expr: 'tq_global_index_reusable_total',
          editorMode: 'code',
          legend: '',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizBase: 'stat',
      vizPatch: {
        spec: {
          fieldConfig: {
            defaults: {
              unit: null,
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'orange',
                  },
                ],
              },
            },
          },
        },
      },
    },
    {
      key: 'controller.request_throughput_latency.controller_request_rate_per_second',
      outputKey: 'panel-300',
      id: 300,
      title: 'Controller Request Rate (per second)',
      queries: [
        {
          expr: 'sum by (op_type) (rate(tq_controller_request_total{op_type=~"$op_type"}[$__rate_interval]))',
          editorMode: 'code',
          legend: '{{ op_type }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'mean',
                'max',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              unit: 'ops',
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              custom: {
                fillOpacity: 20,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'controller.request_throughput_latency.controller_request_latency_p50_p99',
      outputKey: 'panel-301',
      id: 301,
      title: 'Controller Request Latency P50 / P99',
      queries: [
        {
          expr: 'histogram_quantile(0.50, sum by (op_type, le) (rate(tq_controller_request_duration_seconds_bucket{op_type=~"$op_type"}[$__rate_interval])))',
          editorMode: 'code',
          legend: 'p50 {{ op_type }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
        {
          expr: 'histogram_quantile(0.99, sum by (op_type, le) (rate(tq_controller_request_duration_seconds_bucket{op_type=~"$op_type"}[$__rate_interval])))',
          editorMode: 'code',
          legend: 'p99 {{ op_type }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      transformations: [
        {
          kind: 'Transformation',
          group: 'filterFieldsByName',
          spec: {
            options: {
              include: {
                pattern: 'Time|(${quantile:regex}).*',
              },
            },
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'mean',
                'max',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              unit: 's',
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              custom: {
                fillOpacity: 10,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'storage.partition_status.samples_per_partition',
      outputKey: 'panel-302',
      id: 302,
      title: 'Samples per Partition',
      queries: [
        {
          expr: 'tq_partition_samples_total',
          editorMode: 'code',
          legend: '{{ partition_id }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'lastNotNull',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              custom: {
                fillOpacity: 10,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'storage.partition_status.production_progress',
      outputKey: 'panel-303',
      id: 303,
      title: 'Production Progress',
      queries: [
        {
          expr: 'tq_partition_production_progress{task_name=~"$task_name"}',
          editorMode: 'code',
          legend: '{{ partition_id }} / {{ task_name }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'lastNotNull',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              unit: 'percentunit',
              min: 0,
              max: 1,
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              color: {
                mode: 'continuous-GrYlRd',
              },
              custom: {
                fillOpacity: 20,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'storage.partition_status.consumption_progress',
      outputKey: 'panel-304',
      id: 304,
      title: 'Consumption Progress',
      queries: [
        {
          expr: 'tq_partition_consumption_progress{task_name=~"$task_name"}',
          editorMode: 'code',
          legend: '{{ partition_id }} / {{ task_name }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'lastNotNull',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              unit: 'percentunit',
              min: 0,
              max: 1,
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              color: {
                mode: 'continuous-GrYlRd',
              },
              custom: {
                fillOpacity: 20,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'storage.storage_units.storage_utilization',
      outputKey: 'panel-305',
      id: 305,
      title: 'Storage Utilization',
      queries: [
        {
          expr: 'tq_storage_utilization_ratio',
          editorMode: 'code',
          legend: '{{ storage_unit_id }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizBase: 'bargauge',
    },
    {
      key: 'storage.storage_units.active_keys_per_storage_unit',
      outputKey: 'panel-306',
      id: 306,
      title: 'Active Keys per Storage Unit',
      queries: [
        {
          expr: 'tq_storage_active_keys_total',
          editorMode: 'code',
          legend: '{{ storage_unit_id }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'lastNotNull',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              custom: {
                fillOpacity: 10,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'storage.storage_units.storage_capacity_vs_active_keys',
      outputKey: 'panel-307',
      id: 307,
      title: 'Storage Capacity vs Active Keys',
      queries: [
        {
          expr: 'tq_storage_capacity_total',
          editorMode: 'code',
          legend: 'capacity {{ storage_unit_id }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
        {
          expr: 'tq_storage_active_keys_total',
          editorMode: 'code',
          legend: 'active {{ storage_unit_id }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'lastNotNull',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              custom: {
                fillOpacity: 10,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'storage.storage_units.storage_process_rss_memory',
      outputKey: 'panel-308',
      id: 308,
      title: 'Storage Process RSS Memory',
      queries: [
        {
          expr: 'tq_storage_memory_rss_bytes',
          editorMode: 'code',
          legend: '{{ storage_unit_id }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'lastNotNull',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              unit: 'bytes',
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              custom: {
                fillOpacity: 10,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'storage.storage_units.storage_request_rate_per_second',
      outputKey: 'panel-309',
      id: 309,
      title: 'Storage Request Rate (per second)',
      queries: [
        {
          expr: 'sum by (op_type) (rate(tq_storage_request_ops{op_type=~"$op_type"}[$__rate_interval]))',
          editorMode: 'code',
          legend: '{{ op_type }}',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'mean',
                'max',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              unit: 'ops',
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              custom: {
                fillOpacity: 20,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'storage.storage_units.storage_request_latency_p50_p99',
      outputKey: 'panel-310',
      id: 310,
      title: 'Storage Request Latency P50 / P99',
      queries: [
        {
          expr: 'tq_storage_request_latency_p50{op_type=~"$op_type"}',
          editorMode: 'code',
          legend: 'p50 {{ op_type }} ({{ storage_unit_id }})',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
        {
          expr: 'tq_storage_request_latency_p99{op_type=~"$op_type"}',
          editorMode: 'code',
          legend: 'p99 {{ op_type }} ({{ storage_unit_id }})',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      transformations: [
        {
          kind: 'Transformation',
          group: 'filterFieldsByName',
          spec: {
            options: {
              include: {
                pattern: 'Time|(${quantile:regex}).*',
              },
            },
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'mean',
                'max',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              unit: 's',
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              custom: {
                fillOpacity: 10,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'storage.storage_units.produced_vs_cleared_samples_per_second',
      outputKey: 'panel-311',
      id: 311,
      title: 'Produced vs Cleared Samples (per second)',
      queries: [
        {
          expr: 'sum(rate(tq_controller_request_samples_total{op_type="NOTIFY_DATA_UPDATE"}[$__rate_interval]))',
          editorMode: 'code',
          legend: 'Produced samples/s',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
        {
          expr: 'sum(rate(tq_controller_request_samples_total{op_type="CLEAR_META"}[$__rate_interval]))',
          editorMode: 'code',
          legend: 'Cleared samples/s',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'mean',
                'max',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              unit: 'short',
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              custom: {
                fillOpacity: 15,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
    {
      key: 'storage.storage_units.active_keys_delta_put_clear_accumulation',
      outputKey: 'panel-312',
      id: 312,
      title: 'Active Keys Delta (PUT - CLEAR accumulation)',
      queries: [
        {
          expr: 'sum(tq_storage_active_keys_total)',
          editorMode: 'code',
          legend: 'Total Active Keys (all storage units)',
          labels: {
            'grafana.app/export-label': 'prometheus-1',
          },
        },
      ],
      vizPatch: {
        spec: {
          options: {
            legend: {
              calcs: [
                'lastNotNull',
                'max',
              ],
              displayMode: 'table',
            },
            tooltip: {
              mode: 'multi',
            },
          },
          fieldConfig: {
            defaults: {
              unit: 'short',
              thresholds: {
                steps: [
                  {
                    value: 0,
                    color: 'green',
                  },
                ],
              },
              color: {
                mode: 'continuous-GrYlRd',
              },
              custom: {
                fillOpacity: 20,
                showPoints: 'auto',
              },
            },
          },
        },
      },
    },
  ],
  rows: {
    'rl state timeline': {
      kind: 'RowsLayoutRow',
      spec: {
        title: 'rl state timeline',
        collapse: true,
        layout: {
          kind: 'GridLayout',
          spec: {
            items: [
              {
                kind: 'GridLayoutItem',
                spec: {
                  x: 0,
                  y: 0,
                  width: 24,
                  height: 18,
                  element: {
                    kind: 'ElementReference',
                    name: 'trajectory.metric.state_timeline',
                  },
                },
              },
            ],
          },
        },
      },
    },
    'training metric': {
      kind: 'RowsLayoutRow',
      spec: {
        title: 'training metric',
        collapse: true,
        layout: {
          kind: 'RowsLayout',
          spec: {
            rows: [
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'actor',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_entropy',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_entropy_loss',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_grad_norm',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_kl_coef',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_kl_loss',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_loss',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_lr',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_perf_cpu_memory_used_gb',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_perf_max_memory_allocated_gb',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_perf_max_memory_reserved_gb',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_pg_clipfrac',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_pg_clipfrac_lower',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 32,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_pg_loss',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 32,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.actor.actor_ppo_kl',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'critic',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_advantages_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_advantages_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_advantages_min',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_returns_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_returns_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_returns_min',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_rewards_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_rewards_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_rewards_min',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_score_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_score_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.critic.critic_score_min',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'global_seqlen',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.global_seqlen.global_seqlen_balanced_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.global_seqlen.global_seqlen_balanced_min',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.global_seqlen.global_seqlen_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.global_seqlen.global_seqlen_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.global_seqlen.global_seqlen_min',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.global_seqlen.global_seqlen_minmax_diff',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'perf',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.perf.perf_mfu_actor',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.perf.perf_total_num_tokens',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.perf.perf_throughput',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.perf.perf_time_per_step',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'prompt_length',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.prompt_length.prompt_length_clip_ratio',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.prompt_length.prompt_length_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.prompt_length.prompt_length_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.prompt_length.prompt_length_min',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'response',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.response.response_aborted_ratio',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.response.response_length_clip_ratio',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.response.response_length_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.response.response_length_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.response.response_length_min',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.response.response_length_non_aborted_clip_ratio',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.response.response_length_non_aborted_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.response.response_length_non_aborted_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.response.response_length_non_aborted_min',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'rollout',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_chi2_seq',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_chi2_token',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_k3_kl',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_kl',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_log_ppl_abs_diff',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_log_ppl_diff',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_log_ppl_diff_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_log_ppl_diff_min',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_ppl_ratio',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_rollout_log_ppl',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_rollout_ppl',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_training_log_ppl',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 32,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.rollout.rollout_corr_training_ppl',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'timing',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_per_token_ms_adv',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_per_token_ms_gen',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_per_token_ms_ref',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_per_token_ms_update_actor',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_s_adv',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_s_gen',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_s_old_log_prob',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_s_ref',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.rl_insight_monitor_timing_s_update_actor',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_s_update_weights',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_s_step',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.timing.timing_s_testing',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'training',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_epoch',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_global_step',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_num_turns_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_num_turns_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_num_turns_min',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_rollout_actor_probs_pearson_corr',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_rollout_probs_diff_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_rollout_probs_diff_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 16,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_rollout_probs_diff_std',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_rollout_probs_diff_valid',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_off_policy_trajectory_spans_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 24,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_off_policy_trajectory_spans_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 32,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_off_policy_trajectory_spans_min',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 32,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_off_policy_trajectory_staleness_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 32,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_off_policy_trajectory_staleness_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 40,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_off_policy_trajectory_staleness_worst_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 40,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_off_policy_trajectory_staleness_worst_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 40,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.training.training_off_policy_trajectory_staleness_worst_min',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'val',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.val.val_aux_num_turns_max',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.val.val_aux_num_turns_mean',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.val.val_aux_num_turns_min',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.val.val_aux_openai_gsm8k_reward_mean_1',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 8,
                            width: 8,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'training.val.val_core_openai_gsm8k_acc_mean_1',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
    'transfer queue metric': {
      kind: 'RowsLayoutRow',
      spec: {
        title: 'transfer queue metric',
        collapse: true,
        layout: {
          kind: 'RowsLayout',
          spec: {
            rows: [
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'Controller Overview',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 4,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'controller.controller_overview.controller_uptime',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 4,
                            y: 0,
                            width: 4,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'controller.controller_overview.controller_rss_memory',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 8,
                            y: 0,
                            width: 4,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'controller.controller_overview.active_partitions',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 12,
                            y: 0,
                            width: 4,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'controller.controller_overview.global_indexes_allocated',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 16,
                            y: 0,
                            width: 4,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'controller.controller_overview.reusable_indexes',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'Request Throughput & Latency',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'controller.request_throughput_latency.controller_request_rate_per_second',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 12,
                            y: 0,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'controller.request_throughput_latency.controller_request_latency_p50_p99',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'Partition Status',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.partition_status.samples_per_partition',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 12,
                            y: 0,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.partition_status.consumption_progress',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.partition_status.production_progress',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              {
                kind: 'RowsLayoutRow',
                spec: {
                  title: 'Storage Units',
                  collapse: true,
                  layout: {
                    kind: 'GridLayout',
                    spec: {
                      items: [
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 0,
                            width: 24,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.storage_units.storage_utilization',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 8,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.storage_units.active_keys_per_storage_unit',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 12,
                            y: 8,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.storage_units.storage_capacity_vs_active_keys',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 16,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.storage_units.storage_process_rss_memory',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 12,
                            y: 16,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.storage_units.storage_request_latency_p50_p99',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 24,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.storage_units.storage_request_rate_per_second',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 32,
                            width: 12,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.storage_units.produced_vs_cleared_samples_per_second',
                            },
                          },
                        },
                        {
                          kind: 'GridLayoutItem',
                          spec: {
                            x: 0,
                            y: 40,
                            width: 24,
                            height: 8,
                            element: {
                              kind: 'ElementReference',
                              name: 'storage.storage_units.active_keys_delta_put_clear_accumulation',
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
  variables: {
    task_name: {
      kind: 'QueryVariable',
      spec: {
        name: 'task_name',
        current: {
          text: '',
          value: '',
        },
        label: 'transfer queue: Task',
        hide: 'dontHide',
        refresh: 'onDashboardLoad',
        skipUrlSync: false,
        query: {
          kind: 'DataQuery',
          group: 'prometheus',
          version: 'v0',
          datasource: {
            name: '${datasource}',
          },
          spec: {
            query: 'label_values(tq_partition_consumption_progress, task_name)',
            refId: 'StandardVariableQuery',
          },
        },
        regex: '',
        regexApplyTo: 'value',
        sort: 'disabled',
        definition: 'label_values(tq_partition_consumption_progress, task_name)',
        options: [],
        multi: true,
        includeAll: true,
        allValue: '.*',
        allowCustomValue: true,
      },
    },
    quantile: {
      kind: 'CustomVariable',
      spec: {
        name: 'quantile',
        query: 'p50,p99',
        current: {
          text: 'All',
          value: '$__all',
        },
        options: [],
        multi: true,
        includeAll: true,
        allValue: '.*',
        label: 'transfer queue: Quantile',
        hide: 'dontHide',
        skipUrlSync: false,
        allowCustomValue: true,
        valuesFormat: 'csv',
      },
    },
    experiment_name: {
      kind: 'QueryVariable',
      spec: {
        name: 'experiment_name',
        current: {
          text: 'All',
          value: '$__all',
        },
        label: 'training: Experiment Name',
        hide: 'dontHide',
        refresh: 'onDashboardLoad',
        skipUrlSync: false,
        query: {
          kind: 'DataQuery',
          group: 'prometheus',
          version: 'v0',
          datasource: {
            name: '${datasource}',
          },
          spec: {
            query: 'label_values({__name__=~"rl_insight_monitor_.*"}, experiment_name)',
            refId: 'StandardVariableQuery',
          },
        },
        regex: '',
        regexApplyTo: 'value',
        sort: 'alphabeticalAsc',
        definition: 'label_values({__name__=~"rl_insight_monitor_.*"}, experiment_name)',
        options: [],
        multi: true,
        includeAll: true,
        allValue: '.*',
        allowCustomValue: true,
      },
    },
    op_type: {
      kind: 'CustomVariable',
      spec: {
        name: 'op_type',
        query: 'PUT_DATA,GET_DATA,CLEAR_DATA,GET_META,CLEAR_META,NOTIFY_DATA_UPDATE',
        current: {
          text: 'All',
          value: '$__all',
        },
        options: [],
        multi: true,
        includeAll: true,
        allValue: '.*',
        label: 'transfer queue: Op Type',
        hide: 'dontHide',
        skipUrlSync: false,
        allowCustomValue: true,
        valuesFormat: 'csv',
      },
    },
    datasource: {
      kind: 'DatasourceVariable',
      spec: {
        name: 'datasource',
        pluginId: 'prometheus',
        refresh: 'onDashboardLoad',
        regex: '',
        current: {
          text: '',
          value: '',
        },
        options: [],
        multi: false,
        includeAll: false,
        hide: 'hideVariable',
        skipUrlSync: false,
        description: 'Filter queries of a specific Prometheus type.',
        allowCustomValue: true,
      },
    },
    project: {
      kind: 'QueryVariable',
      spec: {
        name: 'project',
        current: {
          text: 'All',
          value: '$__all',
        },
        label: 'training: Project',
        hide: 'dontHide',
        refresh: 'onDashboardLoad',
        skipUrlSync: false,
        query: {
          kind: 'DataQuery',
          group: 'prometheus',
          version: 'v0',
          datasource: {
            name: '${datasource}',
          },
          spec: {
            query: 'label_values({__name__=~"rl_insight_monitor_.*"}, project)',
            refId: 'StandardVariableQuery',
          },
        },
        regex: '',
        regexApplyTo: 'value',
        sort: 'alphabeticalAsc',
        definition: 'label_values({__name__=~"rl_insight_monitor_.*"}, project)',
        options: [],
        multi: true,
        includeAll: true,
        allValue: '.*',
        allowCustomValue: true,
      },
    },
  },
  trainingMetrics: [
    ['training.actor.actor_entropy_loss', 'panel-185', 185, 'actor_entropy_loss'],
    ['training.actor.actor_grad_norm', 'panel-186', 186, 'actor_grad_norm'],
    ['training.actor.actor_kl_coef', 'panel-187', 187, 'actor_kl_coef'],
    ['training.actor.actor_kl_loss', 'panel-188', 188, 'actor_kl_loss'],
    ['training.actor.actor_loss', 'panel-189', 189, 'actor_loss'],
    ['training.actor.actor_lr', 'panel-190', 190, 'actor_lr'],
    ['training.actor.actor_perf_cpu_memory_used_gb', 'panel-191', 191, 'actor_perf_cpu_memory_used_gb'],
    ['training.actor.actor_perf_max_memory_allocated_gb', 'panel-192', 192, 'actor_perf_max_memory_allocated_gb'],
    ['training.actor.actor_perf_max_memory_reserved_gb', 'panel-193', 193, 'actor_perf_max_memory_reserved_gb'],
    ['training.actor.actor_pg_clipfrac', 'panel-194', 194, 'actor_pg_clipfrac'],
    ['training.actor.actor_pg_clipfrac_lower', 'panel-195', 195, 'actor_pg_clipfrac_lower'],
    ['training.actor.actor_pg_loss', 'panel-196', 196, 'actor_pg_loss'],
    ['training.actor.actor_ppo_kl', 'panel-197', 197, 'actor_ppo_kl'],
    ['training.critic.critic_advantages_max', 'panel-198', 198, 'critic_advantages_max'],
    ['training.critic.critic_advantages_mean', 'panel-199', 199, 'critic_advantages_mean'],
    ['training.critic.critic_advantages_min', 'panel-200', 200, 'critic_advantages_min'],
    ['training.critic.critic_returns_max', 'panel-201', 201, 'critic_returns_max'],
    ['training.critic.critic_returns_mean', 'panel-202', 202, 'critic_returns_mean'],
    ['training.critic.critic_returns_min', 'panel-203', 203, 'critic_returns_min'],
    ['training.critic.critic_rewards_max', 'panel-204', 204, 'critic_rewards_max'],
    ['training.critic.critic_rewards_mean', 'panel-205', 205, 'critic_rewards_mean'],
    ['training.critic.critic_rewards_min', 'panel-206', 206, 'critic_rewards_min'],
    ['training.global_seqlen.global_seqlen_balanced_max', 'panel-210', 210, 'global_seqlen_balanced_max'],
    ['training.global_seqlen.global_seqlen_balanced_min', 'panel-211', 211, 'global_seqlen_balanced_min'],
    ['training.global_seqlen.global_seqlen_max', 'panel-212', 212, 'global_seqlen_max'],
    ['training.global_seqlen.global_seqlen_mean', 'panel-213', 213, 'global_seqlen_mean'],
    ['training.global_seqlen.global_seqlen_min', 'panel-214', 214, 'global_seqlen_min'],
    ['training.global_seqlen.global_seqlen_minmax_diff', 'panel-215', 215, 'global_seqlen_minmax_diff'],
    ['training.perf.perf_mfu_actor', 'panel-219', 219, 'perf_mfu_actor'],
    ['training.perf.perf_throughput', 'panel-221', 221, 'perf_throughput'],
    ['training.perf.perf_time_per_step', 'panel-222', 222, 'perf_time_per_step'],
    ['training.perf.perf_total_num_tokens', 'panel-223', 223, 'perf_total_num_tokens'],
    ['training.prompt_length.prompt_length_clip_ratio', 'panel-224', 224, 'prompt_length_clip_ratio'],
    ['training.prompt_length.prompt_length_max', 'panel-225', 225, 'prompt_length_max'],
    ['training.prompt_length.prompt_length_mean', 'panel-226', 226, 'prompt_length_mean'],
    ['training.prompt_length.prompt_length_min', 'panel-227', 227, 'prompt_length_min'],
    ['training.response.response_aborted_ratio', 'panel-228', 228, 'response_aborted_ratio'],
    ['training.response.response_length_clip_ratio', 'panel-229', 229, 'response_length_clip_ratio'],
    ['training.response.response_length_max', 'panel-230', 230, 'response_length_max'],
    ['training.response.response_length_mean', 'panel-231', 231, 'response_length_mean'],
    ['training.response.response_length_min', 'panel-232', 232, 'response_length_min'],
    ['training.response.response_length_non_aborted_clip_ratio', 'panel-233', 233, 'response_length_non_aborted_clip_ratio'],
    ['training.response.response_length_non_aborted_max', 'panel-234', 234, 'response_length_non_aborted_max'],
    ['training.response.response_length_non_aborted_mean', 'panel-235', 235, 'response_length_non_aborted_mean'],
    ['training.response.response_length_non_aborted_min', 'panel-236', 236, 'response_length_non_aborted_min'],
    ['training.rollout.rollout_corr_chi2_seq', 'panel-237', 237, 'rollout_corr_chi2_seq'],
    ['training.rollout.rollout_corr_chi2_token', 'panel-238', 238, 'rollout_corr_chi2_token'],
    ['training.rollout.rollout_corr_k3_kl', 'panel-239', 239, 'rollout_corr_k3_kl'],
    ['training.rollout.rollout_corr_kl', 'panel-240', 240, 'rollout_corr_kl'],
    ['training.rollout.rollout_corr_log_ppl_abs_diff', 'panel-241', 241, '_rollout_corr_log_ppl_abs_diff'],
    ['training.rollout.rollout_corr_log_ppl_diff', 'panel-242', 242, 'rollout_corr_log_ppl_diff'],
    ['training.rollout.rollout_corr_log_ppl_diff_max', 'panel-243', 243, 'rollout_corr_log_ppl_diff_max'],
    ['training.rollout.rollout_corr_log_ppl_diff_min', 'panel-244', 244, 'rollout_corr_log_ppl_diff_min'],
    ['training.rollout.rollout_corr_ppl_ratio', 'panel-245', 245, 'rollout_corr_ppl_ratio'],
    ['training.rollout.rollout_corr_rollout_log_ppl', 'panel-246', 246, 'rollout_corr_rollout_log_ppl'],
    ['training.rollout.rollout_corr_rollout_ppl', 'panel-247', 247, 'rollout_corr_rollout_ppl'],
    ['training.rollout.rollout_corr_training_log_ppl', 'panel-248', 248, 'rollout_corr_training_log_ppl'],
    ['training.rollout.rollout_corr_training_ppl', 'panel-249', 249, 'rollout_corr_training_ppl'],
    ['training.timing.timing_per_token_ms_adv', 'panel-250', 250, 'timing_per_token_ms_adv'],
    ['training.timing.timing_per_token_ms_gen', 'panel-251', 251, 'timing_per_token_ms_gen'],
    ['training.timing.timing_per_token_ms_ref', 'panel-252', 252, 'timing_per_token_ms_ref'],
    ['training.timing.timing_per_token_ms_update_actor', 'panel-253', 253, 'timing_per_token_ms_update_actor'],
    ['training.timing.timing_s_adv', 'panel-254', 254, 'timing_s_adv'],
    ['training.timing.timing_s_gen', 'panel-273', 273, 'timing_s_gen'],
    ['training.timing.timing_s_old_log_prob', 'panel-274', 274, 'timing_s_old_log_prob'],
    ['training.timing.timing_s_ref', 'panel-275', 275, 'timing_s_ref'],
    ['training.timing.timing_s_step', 'panel-278', 278, 'timing_s_step'],
    ['training.timing.timing_s_testing', 'panel-280', 280, 'timing_s_testing'],
    ['training.timing.rl_insight_monitor_timing_s_update_actor', 'panel-281', 281, 'rl_insight_monitor_timing_s_update_actor'],
    ['training.timing.timing_s_update_weights', 'panel-282', 282, 'timing_s_update_weights'],
    ['training.training.training_rollout_actor_probs_pearson_corr', 'panel-285', 285, 'training_rollout_actor_probs_pearson_corr'],
    ['training.training.training_rollout_probs_diff_max', 'panel-286', 286, 'training_rollout_probs_diff_max'],
    ['training.training.training_rollout_probs_diff_mean', 'panel-287', 287, 'training_rollout_probs_diff_mean'],
    ['training.training.training_rollout_probs_diff_std', 'panel-288', 288, 'training_rollout_probs_diff_std'],
    ['training.training.training_rollout_probs_diff_valid', 'panel-289', 289, 'training_rollout_probs_diff_valid'],
    ['training.val.val_aux_num_turns_max', 'panel-290', 290, 'val_aux_num_turns_max'],
    ['training.val.val_aux_num_turns_mean', 'panel-291', 291, 'val_aux_num_turns_mean'],
    ['training.val.val_aux_num_turns_min', 'panel-292', 292, 'val_aux_num_turns_min'],
    ['training.val.val_aux_openai_gsm8k_reward_mean_1', 'panel-293', 293, 'val_aux_openai_gsm8k_reward_mean_1'],
    ['training.val.val_core_openai_gsm8k_acc_mean_1', 'panel-294', 294, 'val_core_openai_gsm8k_acc_mean_1'],
    ['training.training.training_num_turns_max', 'panel-314', 314, 'training_num_turns_max'],
    ['training.training.training_off_policy_trajectory_spans_mean', 'panel-315', 315, 'training_off_policy_trajectory_spans_mean'],
    ['training.training.training_num_turns_mean', 'panel-316', 316, 'training_num_turns_mean'],
    ['training.training.training_off_policy_trajectory_spans_min', 'panel-317', 317, 'training_off_policy_trajectory_spans_min'],
    ['training.training.training_off_policy_trajectory_staleness_max', 'panel-318', 318, 'training_off_policy_trajectory_staleness_max'],
    ['training.training.training_off_policy_trajectory_staleness_worst_max', 'panel-319', 319, 'training_off_policy_trajectory_staleness_worst_max'],
    ['training.training.training_num_turns_min', 'panel-320', 320, 'training_num_turns_min'],
    ['training.training.training_off_policy_trajectory_staleness_mean', 'panel-321', 321, 'training_off_policy_trajectory_staleness_mean'],
    ['training.training.training_off_policy_trajectory_spans_max', 'panel-322', 322, 'training_off_policy_trajectory_spans_max'],
    ['training.training.training_off_policy_trajectory_staleness_worst_min', 'panel-323', 323, 'training_off_policy_trajectory_staleness_worst_min'],
    ['training.training.training_off_policy_trajectory_staleness_worst_mean', 'panel-324', 324, 'training_off_policy_trajectory_staleness_worst_mean'],
  ],
}
