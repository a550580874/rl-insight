from earlybird.search.models import Candidate

def test_identity_preference():
    assert Candidate(query="q", aweme_id="a").identity()[1] == "aweme_id"
    assert Candidate(query="q", share_url="https://v").identity()[1] == "share_url"
    assert Candidate(query="q", title="T", author="A").identity()[1] == "fingerprint"

