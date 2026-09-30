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

def test_query_timestamps_and_risk_event_are_persisted(tmp_path):
    store = Store(tmp_path / "test.db")
    run_id = store.start_run("q")
    row = store.connection.execute("select last_run_at,last_success_at from search_queries where query='q'").fetchone()
    assert row["last_run_at"] and row["last_success_at"] is None
    store.record_risk(run_id, "verification", "modal", "HUMAN_REQUIRED")
    assert store.connection.execute("select count(*) n from risk_events").fetchone()["n"] == 1
    store.finish_run(run_id, "HUMAN_REQUIRED", 0, 0, "HUMAN_REQUIRED")
    assert store.connection.execute("select last_success_at from search_queries where query='q'").fetchone()[0] is None
    run_id = store.start_run("q"); store.finish_run(run_id, "DONE", 1, 1)
    assert store.connection.execute("select last_success_at from search_queries where query='q'").fetchone()[0]
