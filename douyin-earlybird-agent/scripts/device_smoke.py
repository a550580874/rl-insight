import json
import platform
import urllib.request
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from earlybird.mobile.client import find_mobilecli, mobilecli_devices

def main():
    root = Path(__file__).parents[1]; out = root / "artifacts"; out.mkdir(exist_ok=True)
    binary = find_mobilecli(); devices = mobilecli_devices(binary); rows = devices.get("data", {}).get("devices", []) if isinstance(devices, dict) else []
    endpoint = "http://127.0.0.1:12004/health"
    try:
        with urllib.request.urlopen(endpoint, timeout=2): devicekit = "PASS"
    except Exception as exc: devicekit = f"BLOCKED: {exc}"
    status = {"status": "PASS" if rows and devicekit == "PASS" else "BLOCKED", "runtime_type": f"{platform.system()} host runtime", "mobilecli": binary, "devices": rows, "devicekit_health": devicekit, "reason": "No online iOS device" if not rows else "DeviceKit health unavailable"}
    (out / "device_status.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
    (out / "acceptance_summary.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
    print(status["status"], status["reason"])
    return 1 if status["status"] == "BLOCKED" else 0

if __name__ == "__main__": raise SystemExit(main())
