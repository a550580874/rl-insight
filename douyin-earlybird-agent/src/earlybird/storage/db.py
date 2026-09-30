import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from ..search.models import Candidate

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

class Store:
    def __init__(self, path: str | Path):
        self.connection = sqlite3.connect(str(path)); self.connection.row_factory = sqlite3.Row
        self.connection.executescript("""
        CREATE TABLE IF NOT EXISTS search_queries (id INTEGER PRIMARY KEY, query TEXT UNIQUE NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_success_at TEXT);
        CREATE TABLE IF NOT EXISTS search_runs (id INTEGER PRIMARY KEY, query_id INTEGER NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, new_count INTEGER NOT NULL DEFAULT 0, seen_count INTEGER NOT NULL DEFAULT 0, risk_status TEXT, FOREIGN KEY(query_id) REFERENCES search_queries(id));
        CREATE TABLE IF NOT EXISTS candidates (id INTEGER PRIMARY KEY, identity_key TEXT NOT NULL, identity_quality TEXT NOT NULL, query TEXT NOT NULL, source TEXT NOT NULL, title TEXT, author TEXT, publish_text TEXT, description TEXT, visible_text TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, raw_json TEXT NOT NULL, UNIQUE(identity_key, query));
        CREATE TABLE IF NOT EXISTS risk_events (id INTEGER PRIMARY KEY, run_id INTEGER, created_at TEXT NOT NULL, signal TEXT NOT NULL, detail TEXT, decision TEXT NOT NULL);
        """); self.connection.commit()

    def save_candidate(self, candidate: Candidate) -> bool:
        key, quality = candidate.identity(); stamp = now()
        row = self.connection.execute("SELECT id FROM candidates WHERE identity_key=? AND query=?", (key, candidate.query)).fetchone()
        if row:
            self.connection.execute("UPDATE candidates SET last_seen_at=?,raw_json=?,visible_text=?,title=?,author=?,publish_text=?,description=? WHERE id=?", (stamp, json.dumps(candidate.raw, ensure_ascii=False), candidate.visible_text, candidate.title, candidate.author, candidate.publish_text, candidate.description, row["id"])); self.connection.commit(); return False
        self.connection.execute("INSERT INTO candidates(identity_key,identity_quality,query,source,title,author,publish_text,description,visible_text,first_seen_at,last_seen_at,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (key, quality, candidate.query, candidate.source, candidate.title, candidate.author, candidate.publish_text, candidate.description, candidate.visible_text, stamp, stamp, json.dumps(candidate.raw, ensure_ascii=False))); self.connection.commit(); return True

    def start_run(self, query: str) -> int:
        self.connection.execute("INSERT INTO search_queries(query) VALUES(?) ON CONFLICT(query) DO NOTHING", (query,)); qid = self.connection.execute("SELECT id FROM search_queries WHERE query=?", (query,)).fetchone()["id"]
        cur = self.connection.execute("INSERT INTO search_runs(query_id,started_at,status) VALUES(?,?,?)", (qid, now(), "RUNNING")); self.connection.commit(); return cur.lastrowid

    def finish_run(self, run_id: int, status: str, new_count: int, seen_count: int, risk_status: str | None = None) -> None:
        self.connection.execute("UPDATE search_runs SET finished_at=?,status=?,new_count=?,seen_count=?,risk_status=? WHERE id=?", (now(), status, new_count, seen_count, risk_status, run_id)); self.connection.commit()

    def record_risk(self, run_id: int | None, signal: str, detail: str, decision: str) -> None:
        self.connection.execute("INSERT INTO risk_events(run_id,created_at,signal,detail,decision) VALUES(?,?,?,?,?)", (run_id, now(), signal, detail, decision)); self.connection.commit()

