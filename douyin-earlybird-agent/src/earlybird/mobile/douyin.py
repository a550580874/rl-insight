import re
from typing import Any
from ..risk.guard import RiskGuard
from ..search.models import Candidate

SECURITY_TEXT = ("验证码", "安全验证", "登录失效", "账号异常", "访问频繁", "操作频繁")
NAV_TEXT = {"首页", "朋友", "消息", "我", "推荐", "关注", "搜索", "取消"}

def _children(node: Any) -> list[dict]:
    return node.get("children") or [] if isinstance(node, dict) else []

def walk_tree(node: Any):
    if isinstance(node, dict):
        yield node
        for child in _children(node): yield from walk_tree(child)

def node_text(node: dict) -> str:
    parts = []
    for key in ("label", "name", "value", "placeholderValue"):
        value = node.get(key)
        if isinstance(value, str) and value.strip() and value.strip() not in parts: parts.append(value.strip())
    return " ".join(parts)

def node_bounds(node: dict) -> tuple[int, int] | None:
    rect = node.get("rect")
    if not isinstance(rect, dict): return None
    try: return round(float(rect.get("x", 0)) + float(rect.get("width", 0)) / 2), round(float(rect.get("y", 0)) + float(rect.get("height", 0)) / 2)
    except (TypeError, ValueError): return None

def find_element(tree: Any, *, texts: tuple[str, ...] = (), types: tuple[str, ...] = ()) -> dict | None:
    for node in walk_tree(tree):
        text = node_text(node).lower()
        typ = str(node.get("type", ""))
        if types and typ not in types: continue
        if texts and not any(term.lower() in text for term in texts): continue
        return node
    return None

def detect_security_page(tree: Any) -> str | None:
    if not isinstance(tree, dict): return None
    # Only inspect top-level/modal nodes, not arbitrary result-card text.
    top = [tree, *_children(tree)]
    for node in top:
        typ = str(node.get("type", ""))
        text = node_text(node)
        if typ in {"XCUIElementTypeAlert", "XCUIElementTypeDialog", "XCUIElementTypeSheet"}:
            for signal in SECURITY_TEXT:
                if signal in text: return signal
    return None

def _candidate_nodes(tree: dict) -> list[dict]:
    containers = [n for n in walk_tree(tree) if n.get("type") in {"XCUIElementTypeScrollView", "XCUIElementTypeCollectionView", "XCUIElementTypeTable"}]
    for container in containers:
        children = [n for n in _children(container) if node_text(n)]
        if children: return children
    return [n for n in _children(tree) if node_text(n)]

class DouyinMobileAdapter:
    BUNDLE_ID = "com.ss.iphone.ugc.Aweme"
    def __init__(self, client, guard: RiskGuard): self.client, self.guard = client, guard

    def _check_security(self, tree: Any) -> None:
        signal = detect_security_page(tree)
        if signal: self.guard.report("verification" if "验证" in signal else "risk_control", signal)

    def ensure_foreground(self):
        if self.client.foreground_app() != self.BUNDLE_ID: self.client.launch_app(self.BUNDLE_ID)

    def open_search(self):
        tree = self.client.get_ui_tree(); self._check_security(tree)
        element = find_element(tree, texts=("搜索",), types=("XCUIElementTypeButton", "XCUIElementTypeSearchField", "XCUIElementTypeTextField")) or find_element(tree, texts=("搜索",))
        bounds = node_bounds(element) if element else None
        if not bounds: raise RuntimeError("search locator not found in devicekit UI tree")
        self.client.tap(*bounds)

    def search(self, query: str):
        tree = self.client.get_ui_tree(); self._check_security(tree)
        field = find_element(tree, types=("XCUIElementTypeSearchField", "XCUIElementTypeTextField", "XCUIElementTypeSecureTextField"))
        if not field: field = find_element(tree, texts=("搜索",))
        bounds = node_bounds(field) if field else None
        if not bounds: raise RuntimeError("search input locator not found in devicekit UI tree")
        self.client.tap(*bounds); self.client.type_text(query)
        tree = self.client.get_ui_tree(); self._check_security(tree)
        submit = find_element(tree, texts=("搜索", "Search"), types=("XCUIElementTypeButton",))
        if submit and node_bounds(submit): self.client.tap(*node_bounds(submit))
        else: raise RuntimeError("search submit locator not found in devicekit UI tree")

    def read_visible_results(self) -> list[Candidate]:
        tree = self.client.get_ui_tree(); self._check_security(tree)
        if not isinstance(tree, dict): return []
        candidates = []
        for position, node in enumerate(_candidate_nodes(tree)):
            visible = " ".join(dict.fromkeys(node_text(child) for child in walk_tree(node) if node_text(child)))
            if not visible or visible in NAV_TEXT: continue
            fields = [part for part in visible.split(" ") if part not in NAV_TEXT]
            share_url = next((part for part in fields if part.startswith("http")), None)
            raw_id = node.get("rawIdentifier")
            aweme_id = raw_id if isinstance(raw_id, str) and re.fullmatch(r"\d{8,}", raw_id) else None
            candidates.append(Candidate(title=fields[0] if fields else None, author=None, share_url=share_url, aweme_id=aweme_id, visible_text=visible, position=position, raw=node))
        return candidates

    def scroll_results(self):
        self.client.swipe((200, 650), (200, 250))

    def return_to_search(self): self.client.press_back()
