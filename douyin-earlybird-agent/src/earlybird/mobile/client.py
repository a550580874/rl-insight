import base64
import json
import os
import subprocess
import urllib.request
from pathlib import Path
from typing import Any, Protocol

class MobileClient(Protocol):
    def launch_app(self, bundle_id: str) -> None: ...
    def get_ui_tree(self) -> Any: ...
    def take_screenshot(self, path: str) -> None: ...
    def tap(self, x: int, y: int) -> None: ...
    def type_text(self, text: str) -> None: ...
    def swipe(self, start: tuple[int, int], end: tuple[int, int]) -> None: ...
    def press_back(self) -> None: ...
    def foreground_app(self) -> str | None: ...

class UnconfiguredMobileClient:
    """Explicit adapter seam; production wiring belongs to Mobile MCP/devicekit."""
    def __getattr__(self, name: str):
        raise RuntimeError("Mobile MCP/devicekit client is not configured")

class DeviceKitMobileClient:
    """Concrete client for devicekit-ios' documented localhost JSON-RPC API."""
    def __init__(self, endpoint: str | None = None, timeout: float = 10.0):
        self.endpoint = endpoint or os.environ.get("DEVICEKIT_RPC_URL", "http://127.0.0.1:12004/rpc")
        self.timeout = timeout

    def _rpc(self, method: str, params: dict[str, Any] | None = None) -> Any:
        body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params or {}, "id": 1}).encode()
        request = urllib.request.Request(self.endpoint, body, {"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            payload = json.loads(response.read())
        if "error" in payload:
            raise RuntimeError(f"devicekit RPC {method}: {payload['error']}")
        return payload.get("result")

    def launch_app(self, bundle_id: str) -> None: self._rpc("device.apps.launch", {"bundleId": bundle_id})
    def get_ui_tree(self) -> Any: return self._rpc("device.dump.ui", {"format": "json"})
    def take_screenshot(self, path: str) -> None:
        result = self._rpc("device.screenshot", {"format": "png"})
        data = result.get("data", "") if isinstance(result, dict) else ""
        if "," not in data: raise RuntimeError("devicekit screenshot returned no data URI")
        Path(path).write_bytes(base64.b64decode(data.split(",", 1)[1]))
    def tap(self, x: int, y: int) -> None: self._rpc("device.io.tap", {"x": x, "y": y})
    def type_text(self, text: str) -> None: self._rpc("device.io.text", {"text": text})
    def swipe(self, start: tuple[int, int], end: tuple[int, int]) -> None:
        self._rpc("device.io.swipe", {"x1": start[0], "y1": start[1], "x2": end[0], "y2": end[1], "duration": 0.2})
    def press_back(self) -> None:
        raise RuntimeError("devicekit-ios exposes no iOS BACK button; locate and tap the app's navigation back element")
    def foreground_app(self) -> str | None:
        result = self._rpc("device.apps.foreground")
        return result.get("bundleId") if isinstance(result, dict) else None

class GuardedMobileClient:
    """Single action-budget boundary for every active MobileClient operation."""
    def __init__(self, client: MobileClient, guard): self.client, self.guard = client, guard
    def _action(self, operation, *args, **kwargs):
        if not self.guard.allow_action(): raise RuntimeError(f"action budget stopped {operation}")
        return getattr(self.client, operation)(*args, **kwargs)
    def launch_app(self, bundle_id): return self._action("launch_app", bundle_id)
    def get_ui_tree(self): return self.client.get_ui_tree()
    def take_screenshot(self, path): return self.client.take_screenshot(path)
    def tap(self, x, y): return self._action("tap", x, y)
    def type_text(self, text): return self._action("type_text", text)
    def swipe(self, start, end): return self._action("swipe", start, end)
    def press_back(self): return self._action("press_back")
    def foreground_app(self): return self.client.foreground_app()

def find_mobilecli() -> str | None:
    configured = os.environ.get("MOBILECLI_BIN")
    if configured and Path(configured).exists(): return configured
    for candidate in ("mobilecli", "/usr/local/bin/mobilecli", "/opt/homebrew/bin/mobilecli"):
        if candidate == "mobilecli":
            from shutil import which
            if which(candidate): return candidate
        elif Path(candidate).exists(): return candidate
    return None

def mobilecli_devices(binary: str | None = None) -> dict[str, Any]:
    binary = binary or find_mobilecli()
    if not binary: return {"status": "missing", "data": {"devices": []}}
    completed = subprocess.run([binary, "devices"], capture_output=True, text=True, timeout=15, check=False)
    try: return json.loads(completed.stdout)
    except json.JSONDecodeError: return {"status": "error", "stderr": completed.stderr, "stdout": completed.stdout, "returncode": completed.returncode}
