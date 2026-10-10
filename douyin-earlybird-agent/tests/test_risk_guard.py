from earlybird.risk.guard import RiskDecision, RiskGuard

def test_limits_stop():
    g = RiskGuard(max_queries=1, max_scrolls=1, max_actions=1)
    assert g.allow_query() and not g.allow_query()
    assert g.stopped == RiskDecision.RISK_STOP

def test_security_signals_require_human():
    for signal in ("captcha", "verification", "login_required"):
        assert RiskGuard().report(signal) == RiskDecision.HUMAN_REQUIRED

def test_scroll_is_counted_once_by_policy():
    class Client:
        def __init__(self): self.swipes = 0
        def swipe(self, *_): self.swipes += 1
    guard = RiskGuard(max_scrolls=1)
    client = Client()
    if guard.allow_scroll(): client.swipe((1, 2), (3, 4))
    if guard.allow_scroll(): client.swipe((1, 2), (3, 4))
    assert (client.swipes, guard.scrolls) == (1, 1)

def test_action_budget_wraps_active_operations():
    from earlybird.mobile.client import GuardedMobileClient
    class Client:
        def __init__(self): self.taps = 0
        def tap(self, *_): self.taps += 1
    guard = RiskGuard(max_actions=1); client = Client(); wrapped = GuardedMobileClient(client, guard)
    wrapped.tap(1, 2)
    try: wrapped.tap(1, 2)
    except RuntimeError: pass
    assert (client.taps, guard.actions) == (1, 1)
