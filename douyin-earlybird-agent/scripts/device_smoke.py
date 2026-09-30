import json
import shutil
from pathlib import Path

def main():
    root = Path(__file__).parents[1]; out = root / "artifacts"; out.mkdir(exist_ok=True)
    tools = {name: shutil.which(name) for name in ("mobilecli", "devicekit-ios")}
    status = {"status": "BLOCKED" if not any(tools.values()) else "UNKNOWN", "tools": tools, "reason": "No Mobile MCP/devicekit executable is installed in this runtime."}
    (out / "device_status.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
    print(status["status"], status["reason"])
    return 1 if status["status"] == "BLOCKED" else 0

if __name__ == "__main__": raise SystemExit(main())

