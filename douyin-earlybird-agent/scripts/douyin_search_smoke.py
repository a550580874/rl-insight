"""Live smoke entry point; requires a configured MobileClient implementation."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from earlybird.mobile.client import UnconfiguredMobileClient
from earlybird.risk.guard import RiskGuard
from earlybird.mobile.douyin import DouyinMobileAdapter

if __name__ == "__main__":
    print("BLOCKED: configure Mobile MCP/devicekit MobileClient and provide an unlocked, trusted iPhone.")
    raise SystemExit(1)

