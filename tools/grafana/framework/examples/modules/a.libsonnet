// Module A: two panels, one variable, two rows.
// Purely an example fixture - no production or engine-specific content.
{
  tags: ['alpha'],
  panels: [
    {
      key: 'a.request_rate',
      outputKey: 'a-request-rate',
      id: 1,
      title: 'A - request rate',
      description: 'Example timeseries panel from module A.',
      queries: [
        { expr: 'toy_a_requests_total{region=~"$region"}', legend: '{{service}}' },
      ],
      vizBase: 'timeseries',
    },
    {
      key: 'a.error_count',
      outputKey: 'a-error-count',
      id: 2,
      title: 'A - error count',
      description: 'Example stat panel from module A.',
      queries: [
        { expr: 'sum(toy_a_errors_total{region=~"$region"})' },
      ],
      vizBase: 'stat',
    },
  ],
  rows: {
    'a-overview': {
      kind: 'RowsLayoutRow',
      spec: {
        title: 'A overview',
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
                  width: 12,
                  height: 8,
                  element: { kind: 'ElementReference', name: 'a.request_rate' },
                },
              },
            ],
          },
        },
      },
    },
    'a-details': {
      kind: 'RowsLayoutRow',
      spec: {
        title: 'A details',
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
                  width: 6,
                  height: 6,
                  element: { kind: 'ElementReference', name: 'a.error_count' },
                },
              },
            ],
          },
        },
      },
    },
  },
  variables: {
    region: {
      kind: 'ConstantVariable',
      spec: {
        name: 'region',
        label: 'Region',
        value: 'eu-1',
        hide: 'dontHide',
      },
    },
  },
}
