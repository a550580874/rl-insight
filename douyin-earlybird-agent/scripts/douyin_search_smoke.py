"""Bounded Stage 1B live smoke test using the documented DeviceKit JSON-RPC API."""
import json
import os
import platform
import urllib.request
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from earlybird.mobile.client import DeviceKitMobileClient, GuardedMobileClient, find_mobilecli, mobilecli_devices
from earlybird.mobile.douyin import DouyinMobileAdapter
from earlybird.risk.guard import RiskGuard
from earlybird.search.state_machine import SearchRunner
from earlybird.storage.db import Store

QUERY = "上海 展会 早鸟票"
FALLBACK_QUERY = "上海 咖啡展"

def health(endpoint: str) -> bool:
    url = endpoint.rsplit("/rpc", 1)[0] + "/health"
    try:
        with urllib.request.urlopen(url, timeout=2): return True
    except Exception: return False

def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")

def main() -> int:
    root = Path(__file__).parents[1]; artifacts = root / "artifacts"; artifacts.mkdir(exist_ok=True)
    endpoint = os.environ.get("DEVICEKIT_RPC_URL", "http://127.0.0.1:12004/rpc")
    binary = find_mobilecli(); devices = mobilecli_devices(binary)
    device_rows = devices.get("data", {}).get("devices", []) if isinstance(devices, dict) else []
    device_status = {"runtime_type": f"{platform.system()} host runtime", "mobilecli": binary, "devices": device_rows, "devicekit_health": health(endpoint), "endpoint": endpoint}
    write_json(artifacts / "device_status.json", device_status)
    if not device_rows:
        summary = {"status": "BLOCKED", "reason": "C_USB_DEVICE: mobilecli is available but returned no online iOS device (USB trust/unlock/Developer Mode or host-device attachment is required).", "device_status": device_status}
        write_json(artifacts / "acceptance_summary.json", summary); print("BLOCKED", summary["reason"]); return 1
    if not device_status["devicekit_health"]:
        summary = {"status": "BLOCKED", "reason": "D_MOBILE_MCP_SERVER: an online device was found but devicekit-ios JSON-RPC health is unavailable at the configured endpoint.", "device_status": device_status}
        write_json(artifacts / "acceptance_summary.json", summary); print("BLOCKED", summary["reason"]); return 1

    guard = RiskGuard(); raw_client = DeviceKitMobileClient(endpoint); client = GuardedMobileClient(raw_client, guard); adapter = DouyinMobileAdapter(client, guard); store = Store(artifacts / "earlybird.db")
    try:
        adapter.ensure_foreground(); foreground = client.foreground_app(); write_json(artifacts / "foreground_app.json", {"bundle_id": foreground})
        client.take_screenshot(str(artifacts / "douyin_before_search.png")); tree = client.get_ui_tree(); write_json(artifacts / "ui_tree_sample.json", tree)
        first = SearchRunner(adapter, store, guard).run(QUERY)
        if first.get("status") == "DONE" and first.get("seen_count") == 0:
            first = SearchRunner(adapter, store, guard).run(FALLBACK_QUERY)
        write_json(artifacts / "search_run.json", first); write_json(artifacts / "search_result.json", first)
        client.take_screenshot(str(artifacts / "douyin_search_result.png"))
        second = SearchRunner(adapter, store, guard).run(first.get("query", QUERY)) if first.get("status") == "DONE" else None
        write_json(artifacts / "risk_events.json", guard.events)
        summary = {"status": "PASS" if first.get("status") == "DONE" and first.get("new_count", 0) >= 1 and second and second.get("status") == "DONE" else "PARTIAL_PASS", "first_run": first, "second_run": second, "device_status": device_status}
    except Exception as exc:
        error = {"status": "BLOCKED_APP_LAUNCH", "error": str(exc), "attempts": 1, "device_status": device_status}
        (artifacts / "runner_launch_after_trust.txt").write_text(str(exc) + "\n", encoding="utf-8")
        write_json(artifacts / "search_run.json", error); write_json(artifacts / "search_result.json", error); write_json(artifacts / "risk_events.json", guard.events)
        summary = error
    write_json(artifacts / "acceptance_summary.json", summary); print(summary["status"]); return 0 if summary["status"] == "PASS" else 1

if __name__ == "__main__": raise SystemExit(main())
