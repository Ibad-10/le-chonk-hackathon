from app.training import case_turns


def test_genuine_caller_gives_real_verification_details():
    case = {"kind": "genuine", "customer_id": "cust_margaret", "caller_turns": ["Hi.", "Add my son as payee."]}
    turns = case_turns(case)
    assert turns[0] == "Hi." and turns[2] == "Add my son as payee."
    assert "1952-03-14" in turns[1] and "ZZ1 4QT" in turns[1] and "Biscuit" in turns[1]


def test_scam_caller_unchanged():
    case = {"kind": "scam", "customer_id": "cust_margaret", "caller_turns": ["a", "b"]}
    assert case_turns(case) == ["a", "b"]
