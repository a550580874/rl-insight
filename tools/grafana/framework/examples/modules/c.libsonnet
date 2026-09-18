// Module C: one gauge panel whose vizConfig is derived from the shared
// defaults via a merge patch.
{
  panels: [
    {
      key: 'c.queue_depth',
      outputKey: 'c-queue-depth',
      id: 4,
      title: 'C - queue depth',
      description: 'Example gauge panel from module C.',
      queries: [
        { expr: 'toy_c_queue_depth', legend: 'depth' },
      ],
      vizBase: 'gauge',
      vizPatch: {
        fieldConfig: {
          defaults: {
            min: 0,
            max: 100,
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: null },
                { color: 'red', value: 80 },
              ],
            },
          },
        },
      },
    },
  ],
  rows: {
    'c-row': {
      kind: 'RowsLayoutRow',
      spec: {
        title: 'C row',
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
                  width: 8,
                  height: 6,
                  element: { kind: 'ElementReference', name: 'c.queue_depth' },
                },
              },
            ],
          },
        },
      },
    },
  },
}
