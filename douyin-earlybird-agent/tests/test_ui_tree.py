import pytest
from earlybird.mobile.douyin import CandidateParseError, DouyinMobileAdapter, find_element, node_bounds, detect_security_page
from earlybird.risk.guard import RiskGuard

def test_devicekit_source_tree_schema_is_targeted():
    tree = {"type":"XCUIElementTypeApplication","children":[{"type":"XCUIElementTypeButton","label":"搜索","rect":{"x":10,"y":20,"width":100,"height":40},"children":[]}]}
    node = find_element(tree, texts=("搜索",))
    assert node and node_bounds(node) == (60, 40)

def test_security_detection_only_treats_modal_as_risk():
    safe = {"type":"XCUIElementTypeApplication","children":[{"type":"XCUIElementTypeStaticText","label":"验证码教程"}]}
    modal = {"type":"XCUIElementTypeApplication","children":[{"type":"XCUIElementTypeAlert","label":"安全验证"}]}
    assert detect_security_page(safe) is None
    assert detect_security_page(modal) == "安全验证"

class TreeClient:
    def __init__(self, tree): self.tree = tree
    def get_ui_tree(self): return self.tree

def test_result_candidate_keeps_original_query_and_excludes_navigation():
    tree = {"type":"XCUIElementTypeApplication","children":[
        {"type":"XCUIElementTypeScrollView","children":[
            {"type":"XCUIElementTypeButton","label":"首页","children":[]},
            {"type":"XCUIElementTypeCell","rawIdentifier":"123456789","children":[{"type":"XCUIElementTypeStaticText","label":"上海展会早鸟票"}]},
        ]}
    ]}
    adapter = DouyinMobileAdapter(TreeClient(tree), RiskGuard())
    candidates = adapter.read_visible_results("上海 展会 早鸟票")
    assert len(candidates) == 1
    assert candidates[0].query == "上海 展会 早鸟票"
    assert candidates[0].aweme_id == "123456789"

def test_invalid_result_tree_is_explicit_parser_failure():
    adapter = DouyinMobileAdapter(TreeClient([]), RiskGuard())
    with pytest.raises(CandidateParseError, match="UI_TREE_INVALID"):
        adapter.read_visible_results("q")

def test_navigation_only_tree_has_no_candidates():
    tree = {"type":"XCUIElementTypeApplication","children":[
        {"type":"XCUIElementTypeCollectionView","children":[{"type":"XCUIElementTypeButton","label":"搜索","children":[]}]}
    ]}
    adapter = DouyinMobileAdapter(TreeClient(tree), RiskGuard())
    assert adapter.read_visible_results("q") == []
