from dataclasses import dataclass, field
from enum import Enum
from typing import Callable

class RiskDecision(str, Enum):
    ALLOW = "ALLOW"
    RISK_STOP = "RISK_STOP"
    HUMAN_REQUIRED = "HUMAN_REQUIRED"

RISK_SIGNALS = {"captcha", "verification", "login_required", "risk_control", "too_frequent", "unexpected_screen", "query_limit", "result_limit", "scroll_limit", "action_limit"}

@dataclass
class RiskGuard:
    max_queries: int = 3
    max_results: int = 50
    max_scrolls: int = 2
    max_actions: int = 30
    max_consecutive_failures: int = 2
    queries: int = 0
    results: int = 0
    scrolls: int = 0
    actions: int = 0
    consecutive_failures: int = 0
    events: list[dict] = field(default_factory=list)
    stopped: RiskDecision | None = None
    event_sink: Callable[[dict], None] | None = None

    def _stop(self, signal: str, detail: str = "") -> RiskDecision:
        decision = RiskDecision.HUMAN_REQUIRED if signal in {"captcha", "verification", "login_required"} else RiskDecision.RISK_STOP
        self.events.append({"signal": signal, "detail": detail, "decision": decision.value})
        if self.event_sink:
            self.event_sink(self.events[-1])
        self.stopped = decision
        return decision

    def report(self, signal: str, detail: str = "") -> RiskDecision:
        if signal not in RISK_SIGNALS:
            raise ValueError(f"unknown risk signal: {signal}")
        return self._stop(signal, detail)

    def allow_query(self) -> bool:
        if self.stopped: return False
        if self.queries >= self.max_queries: self._stop("query_limit"); return False
        self.queries += 1
        return True

    def allow_scroll(self) -> bool:
        if self.stopped: return False
        if self.scrolls >= self.max_scrolls: self._stop("scroll_limit"); return False
        self.scrolls += 1
        return True

    def allow_action(self) -> bool:
        if self.stopped: return False
        if self.actions >= self.max_actions: self._stop("action_limit"); return False
        self.actions += 1
        return True

    def allow_launch(self) -> bool:
        return self.allow_action()

    def record_results(self, count: int) -> bool:
        if self.stopped or self.results + count > self.max_results:
            self._stop("result_limit"); return False
        self.results += count
        return True
