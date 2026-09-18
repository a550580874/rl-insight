// Composition config: dashboards composed from example modules.
// `ab` = A+B, reusing module A unchanged. See ../modules/ and README.md.
local composer = import '../../composer.libsonnet';
local a = import '../modules/a.libsonnet';
local b = import '../modules/b.libsonnet';

{
  ab: composer.compose([a, b], {
    metadata: { name: 'example-ab', uid: 'example-ab' },
    title: 'Example dashboard - A+B',
    tags: ['example'],
    spec: {
      time: { from: 'now-6h', to: 'now' },
      refresh: '30s',
    },
    variableOrder: ['region'],
    rowOrder: ['a-overview', 'a-details', 'b-row'],
  }),
}
