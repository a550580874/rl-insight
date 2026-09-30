from earlybird.mobile.douyin import find_element, node_bounds, detect_security_page

def test_devicekit_source_tree_schema_is_targeted():
    tree = {"type":"XCUIElementTypeApplication","children":[{"type":"XCUIElementTypeButton","label":"搜索","rect":{"x":10,"y":20,"width":100,"height":40},"children":[]}]}
    node = find_element(tree, texts=("搜索",))
    assert node and node_bounds(node) == (60, 40)

def test_security_detection_only_treats_modal_as_risk():
    safe = {"type":"XCUIElementTypeApplication","children":[{"type":"XCUIElementTypeStaticText","label":"验证码教程"}]}
    modal = {"type":"XCUIElementTypeApplication","children":[{"type":"XCUIElementTypeAlert","label":"安全验证"}]}
    assert detect_security_page(safe) is None
    assert detect_security_page(modal) == "安全验证"
