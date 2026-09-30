# Douyin EarlyBird Agent (Stage 1)

This is a mobile-first PoC for low-frequency, incremental searches in the official Douyin iOS app. It is not a crawler platform and provides no CAPTCHA, verification, stealth, proxy, private API, or risk-control bypass.

The boundary is `MobileClient` → `DouyinMobileAdapter` → bounded search state machine → `RiskGuard` → SQLite. Candidates use `aweme_id`, then `share_url`, then a clearly labeled fingerprint for deduplication. Missing fields remain null.

Run logic tests with `python -m pytest -q tests` from this directory. `scripts/device_smoke.py` records device-tool availability; `scripts/douyin_search_smoke.py` intentionally stops until a real Mobile MCP/devicekit adapter and human-approved iPhone session are configured. The default guard is conservative: at most 3 queries and 2 scrolls per run.

Known limitation: this checkout has no `mobilecli`, devicekit-ios, or Mobile MCP executable, and no attached iPhone session, so real-device acceptance is PARTIAL_PASS/BLOCKED until those are supplied. Stage 1 ends here.

