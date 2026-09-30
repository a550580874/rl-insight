from earlybird.risk.guard import RiskGuard
from earlybird.search.state_machine import State

def test_state_contract():
    assert State.RISK_STOP.value == "RISK_STOP" and RiskGuard(max_queries=0).allow_query() is False

