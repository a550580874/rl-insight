local viz = import 'viz.libsonnet';

local has(object, field) = std.objectHas(object, field);

// Apply an RFC 7396-style merge patch.  Panel modules only describe the
// fields that differ from the shared visualization defaults.
local mergePatch(base, patch) =
  if std.type(base) != 'object' || std.type(patch) != 'object' then patch
  else
    {
      [field]: base[field]
      for field in std.objectFields(base)
      if !has(patch, field)
    } + {
      [field]:
        if has(base, field) then mergePatch(base[field], patch[field])
        else patch[field]
      for field in std.objectFields(patch)
      if patch[field] != null
    };

local prometheusQuery(query) = {
  kind: 'DataQuery',
  group: 'prometheus',
  version: 'v0',
  spec: {
    editorMode: if has(query, 'editorMode') then query.editorMode else 'builder',
    expr: query.expr,
    legendFormat: if has(query, 'legend') then query.legend else '{{__name__}}',
    range: true,
  } + (if has(query, 'extra') then query.extra else {}),
} + (if has(query, 'labels') then { labels: query.labels } else {});

local panelQuery(query, index) = {
  kind: 'PanelQuery',
  spec: {
    query: if has(query, 'raw') then query.raw else prometheusQuery(query),
    refId: if has(query, 'refId') then query.refId else std.char(std.codepoint('A') + index),
    hidden: if has(query, 'hidden') then query.hidden else false,
  },
};

local panel(record) = {
  kind: 'Panel',
  spec: {
    id: record.id,
    title: record.title,
    description: if has(record, 'description') then record.description else '',
    links: if has(record, 'links') then record.links else [],
    data: {
      kind: 'QueryGroup',
      spec: {
        queries: std.mapWithIndex(function(index, query) panelQuery(query, index), record.queries),
        transformations: if has(record, 'transformations') then record.transformations else [],
        queryOptions: if has(record, 'queryOptions') then record.queryOptions else {},
      },
    },
    vizConfig: mergePatch(
      viz[if has(record, 'vizBase') then record.vizBase else 'timeseries'],
      if has(record, 'vizPatch') then record.vizPatch else {}
    ),
  },
};

local trainingPanel(metric) =
  local title = metric[3];
  local metricName =
    if std.startsWith(title, 'rl_insight_monitor_') then title
    else 'rl_insight_monitor_' + (if std.startsWith(title, '_') then title[1:] else title);
  {
    key: metric[0],
    outputKey: metric[1],
    id: metric[2],
    title: title,
    queries: [{
      expr: metricName + '{project=~"$project", experiment_name=~"$experiment_name"}',
    }],
  };

local replaceReferences(value, outputKeys) =
  if std.type(value) == 'array' then
    [replaceReferences(item, outputKeys) for item in value]
  else if std.type(value) == 'object' then
    if has(value, 'kind') && value.kind == 'ElementReference' then
      value { name: outputKeys[value.name] }
    else
      { [field]: replaceReferences(value[field], outputKeys) for field in std.objectFields(value) }
  else value;

local build(common, engine) =
  local records = common.panels + [trainingPanel(metric) for metric in common.trainingMetrics] + engine.panels;
  local outputKeys = { [record.key]: record.outputKey for record in records };
  local rows = common.rows + engine.rows;
  local variables = common.variables + engine.variables;
  {
    apiVersion: 'dashboard.grafana.app/v2',
    kind: 'Dashboard',
    metadata: engine.metadata,
    spec: common.spec {
      elements: { [record.outputKey]: panel(record) for record in records },
      layout: {
        kind: 'RowsLayout',
        spec: {
          rows: [replaceReferences(rows[name], outputKeys) for name in engine.rowOrder],
        },
      },
      title: engine.title,
      variables: [variables[name] for name in engine.variableOrder],
      tags: engine.tags,
    },
  };

{
  build: build,
}
