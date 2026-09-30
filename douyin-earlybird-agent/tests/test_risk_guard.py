from earlybird.risk.guard import RiskDecision, RiskGuard

def test_limits_stop():
    g = RiskGuard(max_queries=1, max_scrolls=1, max_actions=1)
    assert g.allow_query() and not g.allow_query()
    assert g.stopped == RiskDecision.RISK_STOP

def test_security_signals_require_human():
    for signal in ("captcha", "verification", "login_required"):
        assert RiskGuard().report(signal) == RiskDecision.HUMAN_REQUIRED

