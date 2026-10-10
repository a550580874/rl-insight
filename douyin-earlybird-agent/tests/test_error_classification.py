from earlybird.mobile.douyin import CandidateParseError
from earlybird.risk.guard import RiskDecision, RiskGuard
from earlybird.search.state_machine import SearchRunner
from earlybird.storage.db import Store

class FailingAdapter:
    class Client:
        def foreground_app(self): return "com.ss.iphone.ugc.Aweme"
    client = Client()
    def ensure_foreground(self): pass
    def open_search(self): pass
    def search(self, query): pass
    def read_visible_results(self, query): raise RuntimeError("rpc disconnected")

class ParsingAdapter(FailingAdapter):
    def read_visible_results(self, query): raise CandidateParseError("RESULT_PAGE_NOT_CONFIRMED")

def test_technical_error_is_not_recorded_as_risk(tmp_path):
    guard = RiskGuard()
    result = SearchRunner(FailingAdapter(), Store(tmp_path / "runtime.db"), guard).run("q")
    assert result["status"] == "FAILED_RUNTIME"
    assert result["error_type"] == "RuntimeError"
    assert guard.events == []

def test_parser_error_is_distinct_from_risk(tmp_path):
    guard = RiskGuard()
    result = SearchRunner(ParsingAdapter(), Store(tmp_path / "parser.db"), guard).run("q")
    assert result["status"] == "FAILED_PARSER"
    assert guard.events == []

def test_risk_stop_is_persisted_and_not_misclassified(tmp_path):
    guard = RiskGuard(max_queries=0)
    result = SearchRunner(FailingAdapter(), Store(tmp_path / "risk.db"), guard).run("q")
    assert result["status"] == RiskDecision.RISK_STOP.value
    assert guard.events and guard.events[0]["signal"] == "query_limit"
