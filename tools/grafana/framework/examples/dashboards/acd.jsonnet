// Composition config: dashboards composed from example modules.
// `acd` = A+C+D: the same module A combined with different companions into a
// different dashboard. See ../modules/ and README.md.
local composer = import '../../composer.libsonnet';
local a = import '../modules/a.libsonnet';
local c = import '../modules/c.libsonnet';
local d = import '../modules/d.libsonnet';

{
  acd: composer.compose([a, c, d], {
    metadata: { name: 'example-acd', uid: 'example-acd' },
    title: 'Example dashboard - A+C+D',
    tags: ['example', 'demo'],
    spec: {
      time: { from: 'now-6h', to: 'now' },
      refresh: '30s',
    },
    variableOrder: ['region'],
    rowOrder: ['a-overview', 'c-row', 'a-details', 'd-row'],
  }),
}
