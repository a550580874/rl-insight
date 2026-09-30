from earlybird.search.models import Candidate

def test_identity_preference():
    assert Candidate(query="q", aweme_id="a").identity()[1] == "aweme_id"
    assert Candidate(query="q", share_url="https://v").identity()[1] == "share_url"
    assert Candidate(query="q", title="T", author="A").identity()[1] == "fingerprint"

def test_empty_candidates_do_not_collide():
    first = Candidate(query="q", visible_text="first result")
    second = Candidate(query="q", visible_text="second result")
    assert first.identity()[0] != second.identity()[0]
    assert Candidate(query="q").identity() == (None, "UNIDENTIFIABLE")
