from ..risk.guard import RiskGuard
from ..search.models import Candidate

class DouyinMobileAdapter:
    BUNDLE_ID = "com.ss.iphone.ugc.Aweme"
    def __init__(self, client, guard: RiskGuard): self.client, self.guard = client, guard
    def ensure_foreground(self):
        if self.client.foreground_app() != self.BUNDLE_ID: self.client.launch_app(self.BUNDLE_ID)
    def open_search(self):
        tree = self.client.get_ui_tree()
        if isinstance(tree, str) and "验证" in tree: self.guard.report("verification", "verification text in UI tree")
        self.client.tap(0, 0)  # Concrete locator integration is supplied by Mobile MCP adapter.
    def search(self, query: str):
        self.client.type_text(query); self.client.tap(0, 0)
    def read_visible_results(self) -> list[Candidate]:
        tree = self.client.get_ui_tree()
        if not isinstance(tree, list): return []
        return [Candidate(query="", visible_text=str(item), raw={"ui_node": item}, position=i) for i, item in enumerate(tree)]
    def scroll_results(self):
        if self.guard.allow_scroll(): self.client.swipe((200, 650), (200, 250))
    def return_to_search(self): self.client.press_back()

