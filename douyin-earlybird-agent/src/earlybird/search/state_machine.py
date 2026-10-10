from enum import Enum
from ..risk.guard import RiskDecision, RiskGuard
from ..mobile.douyin import CandidateParseError

class State(str, Enum):
    INIT="INIT"; CHECK_DEVICE="CHECK_DEVICE"; CHECK_AGENT="CHECK_AGENT"; CHECK_DOUYIN="CHECK_DOUYIN"; OPEN_SEARCH="OPEN_SEARCH"; INPUT_QUERY="INPUT_QUERY"; WAIT_RESULT="WAIT_RESULT"; READ_RESULTS="READ_RESULTS"; OPTIONAL_SCROLL="OPTIONAL_SCROLL"; STORE="STORE"; DONE="DONE"; RISK_STOP="RISK_STOP"; HUMAN_REQUIRED="HUMAN_REQUIRED"; FAILED="FAILED"

class SearchRunner:
    def __init__(self, adapter, store, guard: RiskGuard): self.adapter, self.store, self.guard = adapter, store, guard
    def run(self, query: str, scroll: bool = False) -> dict:
        states = []; run_id = self.store.start_run(query); candidates = []
        self.guard.event_sink = lambda event: self.store.record_risk(run_id, event["signal"], event["detail"], event["decision"])
        if not self.guard.allow_query():
            status = self.guard.stopped.value; self.store.finish_run(run_id, status, 0, 0, status)
            return {"status": status, "query": query, "states": [status]}
        try:
            for state in (State.INIT, State.CHECK_DEVICE, State.CHECK_AGENT, State.CHECK_DOUYIN, State.OPEN_SEARCH, State.INPUT_QUERY, State.WAIT_RESULT, State.READ_RESULTS):
                states.append(state.value)
                if state == State.CHECK_DEVICE: self.adapter.client.foreground_app()
                elif state == State.CHECK_AGENT: pass
                elif state == State.CHECK_DOUYIN: self.adapter.ensure_foreground()
                elif state == State.OPEN_SEARCH: self.adapter.open_search()
                elif state == State.INPUT_QUERY: self.adapter.search(query)
                elif state == State.READ_RESULTS:
                    candidates = self.adapter.read_visible_results(query)
            if not candidates:
                states.append("NO_VISIBLE_CANDIDATES"); self.store.finish_run(run_id, "NO_VISIBLE_CANDIDATES", 0, 0, "NO_VISIBLE_CANDIDATES"); return {"status":"NO_VISIBLE_CANDIDATES","query":query,"states":states,"candidates":[]}
            if not self.guard.record_results(len(candidates)):
                status = self.guard.stopped.value; states.append(status); self.store.finish_run(run_id, status, 0, len(candidates), status); return {"status": status, "query": query, "states": states}
            if scroll and self.guard.allow_scroll(): states.append(State.OPTIONAL_SCROLL.value); self.adapter.scroll_results()
            states += [State.STORE.value, State.DONE.value]; new = sum(self.store.save_candidate(c) for c in candidates); self.store.finish_run(run_id, "DONE", new, len(candidates)); return {"status":"DONE","query":query,"states":states,"new_count":new,"seen_count":len(candidates),"candidates":[c.as_dict() for c in candidates]}
        except Exception as exc:
            if self.guard.stopped:
                status = self.guard.stopped.value
            elif isinstance(exc, CandidateParseError):
                status = "FAILED_PARSER"
            else:
                status = "FAILED_RUNTIME"
            states.append(status); self.store.finish_run(run_id, status, 0, len(candidates), status if self.guard.stopped else None)
            return {"status":status,"query":query,"states":states,"error_type":type(exc).__name__,"error":str(exc),"failed_state":states[-2] if len(states) > 1 else None}
