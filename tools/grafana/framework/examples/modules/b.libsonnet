// Module B: one panel and a row that references a panel from module A by
// `key`, demonstrating late reference resolution across modules.
{
  panels: [
    {
      key: 'b.saturation',
      outputKey: 'b-saturation',
      id: 3,
      title: 'B - saturation',
      description: 'Example timeseries panel from module B, with a viz patch.',
      queries: [
        { expr: 'toy_b_saturation_ratio', legend: '{{service}}' },
      ],
      vizBase: 'timeseries',
      vizPatch: {
        options: {
          legend: {
            showLegend: true,
            displayMode: 'table',
            placement: 'bottom',
          },
        },
      },
    },
  ],
  rows: {
    'b-row': {
      kind: 'RowsLayoutRow',
      spec: {
        title: 'B row',
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
                  element: { kind: 'ElementReference', name: 'b.saturation' },
                },
              },
              {
                kind: 'GridLayoutItem',
                spec: {
                  x: 12,
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
  },
}
