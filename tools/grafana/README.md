# Grafana dashboard authoring (production compositions)

This directory holds the **production** Grafana dashboard sources: semantic
content modules, the composition registry that assembles them, a thin
entrypoint, and a thin render wrapper. The generic machinery they use — the
composer, the visualization defaults, and the framework generator — lives in
[`framework/`](framework/README.md) and knows nothing about any concrete
dashboard.

## Architecture

```
semantic modules (dashboards/*.libsonnet)
        │  panels / rows / variables / variables-selectors, plain data
        ▼
dashboard_compositions.libsonnet        ← the single composition registry
        │  per dashboard: aggregate `modules` list + `dashboard` config
        ▼
dashboards.jsonnet                      ← thin stable entrypoint
        │  composer.compose(modules, dashboard) for every registry entry
        ▼
generate_dashboards.py                  ← thin render wrapper
        │  reuses framework/generate.py core (engine + deterministic JSON)
        ▼
rl_insight/config/services/grafana/dashboards/verl/*.json   ← committed JSON
        ▼
Grafana provisioning reads the committed JSON at startup
```

Runtime never executes Jsonnet: `rl-insight` startup only stages and serves
the committed JSON through Grafana provisioning. Jsonnet and go-jsonnet are
development/generation-time tools only; users start and use the service
exactly as before.

## Current compositions

Both live in `dashboard_compositions.libsonnet` and keep their historical
output filenames (`tainer` spelling is intentional):

| registry entry | modules | dashboard title |
| -------------- | ------- | --------------- |
| `verl_tainer_v1_with_vllm_engine` | `verlBase + [vllm, npu]` where `verlBase = [trainer, controller, storage, trajectory]` | `verl_trainer_v1_with_vllm_engine` |
| `verl_tainer_v1_with_sglang_engine` | `verlBase + [sglang]` | `verl_trainer_v1_with_sglang_engine` |

The shared `verlBase` modules carry the trainer-side content (116 panels);
the engine module adds its engine-specific rows, and `npu` the optional NPU
hardware panels used only by the vLLM composition.

## Adding a new dashboard ("Foo")

1. Write `dashboards/foo.libsonnet` with the module schema from the framework
   README (`panels` required; `rows`/`variables`/`tags` optional).
2. Import it in `dashboard_compositions.libsonnet` and add one registry entry
   with `modules` + `dashboard` (metadata, title, tags, spec, `variableOrder`,
   `rowOrder`).
3. Render and commit the JSON (below). Do **not** modify `composer.libsonnet`,
   `viz.libsonnet`, the framework generator, or `dashboards.jsonnet`.

## Extending a dashboard (`trainer` + `trainer_extra` pattern)

- A genuinely new row: the extra module owns it via `rows`.
- One more panel inside the existing `training metric` row: the extra module
  lists the panel under `panels` and appends it with
  [`rowItems`](framework/README.md) targeting `training metric` — additive
  only, the base module stays untouched.
- Do not commit placeholder modules; add real content or nothing.

## Generating and verifying

```bash
# render every registry entry into the committed directory
python tools/grafana/generate_dashboards.py

# verify committed JSON matches the registry (semantic check)
python tools/grafana/generate_dashboards.py --check

# render a custom one-off composition into a scratch directory
python tools/grafana/framework/generate.py \
  --config my_composition.jsonnet --out-dir /tmp/out
```

`--check` compares parsed JSON objects, so it reports real content drift and
ignores serialization-only differences. The framework generator's own
`--check` (`framework/generate.py`) remains byte-exact for framework-owned
outputs; production equivalence is defined semantically because the committed
files are large, shared artifacts. Structure checks (panel counts, content
fingerprints, aggregate uniqueness) live in
`dashboards/verify_modules.jsonnet`; evaluate it with any Jsonnet runner
(e.g. `python -c "import _gojsonnet; _gojsonnet.evaluate_file('tools/grafana/dashboards/verify_modules.jsonnet')"`).

## Limitations

- Composition is additive only: no implicit overrides, no panel patching
  across modules, no inheritance. Duplicate panel `key`/`outputKey`/`id`,
  duplicate owned row/variable names, and unknown `rowOrder`/`variableOrder`
  entries are composition errors.
- `rowItems` can only append items to an existing `GridLayout` row; it cannot
  remove or reorder existing items.
- Output JSON is generated; hand-edits to the committed files are overwritten
  by the next render and rejected by `--check`.
