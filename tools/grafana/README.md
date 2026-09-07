# Grafana dashboard sources

The JSON files under `dashboard_sources/` are the source of truth for the verl
Grafana dashboards. Shared trajectory, training, controller, storage, and
hardware panels live in `common/`; vLLM and SGLang panels live in `engines/`.
`manifest.json` contains dashboard-level settings and variables.

After editing a source module, regenerate the committed dashboards:

```bash
python3 tools/grafana/generate_dashboards.py
```

To verify that the generated files are current without changing them:

```bash
python3 tools/grafana/generate_dashboards.py --check
```

Element keys use dotted semantic names. Layout references are stored beside
their module definitions, so panel keys and references are reviewed together.
