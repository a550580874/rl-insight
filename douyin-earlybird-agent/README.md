# Douyin EarlyBird Agent (Stage 1)

This is a mobile-first PoC for low-frequency, incremental searches in the official Douyin iOS app. It is not a crawler platform and provides no CAPTCHA, verification, stealth, proxy, private API, or risk-control bypass.

The boundary is `DeviceKitMobileClient` (documented JSON-RPC at `127.0.0.1:12004`) → `GuardedMobileClient` → `DouyinMobileAdapter` → bounded search state machine → `RiskGuard` → SQLite. Candidates use `aweme_id`, then `share_url`, then a clearly labeled fingerprint for deduplication. Missing fields remain null. The parser targets DeviceKit's actual `SourceTreeElement` schema: `type`, `label`, `name`, `value`, `placeholderValue`, `rawIdentifier`, `rect`, and `children`.

Run logic tests with `python -m pytest -q tests` from this directory (or install `.[dev]`). `scripts/device_smoke.py` records device-tool availability; `scripts/douyin_search_smoke.py` performs the bounded device → foreground app → UI tree → locator → query → candidate → SQLite → second-run dedup flow when an online iPhone and DeviceKit server are available. The default guard is conservative: at most 3 queries and 2 scrolls per run.

Known limitation: this runtime has the `mobilecli` package but `mobilecli devices` currently returns no online device, and DeviceKit health is unavailable. Real-device acceptance is therefore BLOCKED until the host iPhone/session is attached and the DeviceKit runner is started. Stage 1 ends here.
