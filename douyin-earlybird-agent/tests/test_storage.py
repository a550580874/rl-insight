from earlybird.search.models import Candidate
from earlybird.storage.db import Store

def test_insert_then_update_last_seen(tmp_path):
    store = Store(tmp_path / "test.db")
    c = Candidate(query="上海 展会 早鸟票", aweme_id="a1", title="展会", visible_text="展会", raw={"x": 1})
    assert store.save_candidate(c) is True
    c.raw = {"x": 2}
    assert store.save_candidate(c) is False
    row = store.connection.execute("select count(*) n, raw_json from candidates").fetchone()
    assert row["n"] == 1 and '"x": 2' in row["raw_json"]

