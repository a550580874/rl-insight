// Module D: one panel exercising query options and transformations.
{
  panels: [
    {
      key: 'd.latency_p95',
      outputKey: 'd-latency-p95',
      id: 5,
      title: 'D - latency p95',
      description: 'Example timeseries panel from module D.',
      queries: [
        { expr: 'toy_d_latency_seconds', legend: '{{service}}' },
      ],
      vizBase: 'timeseries',
      queryOptions: {
        timeFrom: '1h',
      },
      transformations: [
        {
          kind: 'Transformation',
          spec: {
            id: 'organize',
            options: {
              indexByName: {},
              excludeByName: {},
            },
          },
        },
      ],
    },
  ],
  rows: {
    'd-row': {
      kind: 'RowsLayoutRow',
      spec: {
        title: 'D row',
        collapse: false,
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
                  element: { kind: 'ElementReference', name: 'd.latency_p95' },
                },
              },
            ],
          },
        },
      },
    },
  },
}
