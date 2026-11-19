"""Criterion: recurring rule generation creates at most one expense per rule per month —
calling /recurring/generate twice in the same month generates it once, then zero."""

import uuid

CARLOS = {"email": "carlos.demo@example.com", "password": "Demo@2026"}


async def _login(aclient, creds):
    r = await aclient.post("/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return r.cookies.get("mc_session")


async def test_generate_recurring_is_idempotent_per_month(aclient):
    cookie = await _login(aclient, CARLOS)
    me = await aclient.get("/auth/me", cookies={"mc_session": cookie})
    category_id = me.json()["expense_categories"][0]["id"]

    rule = await aclient.post("/recurring", cookies={"mc_session": cookie}, json={
        "description": "tscheck-recurring-rule", "day_of_month": 1, "amount_cents": 5000,
        "category_id": category_id, "active": True,
    })
    assert rule.status_code == 201, rule.text
    rule_id = rule.json()["id"]

    try:
        first = await aclient.post("/recurring/generate", cookies={"mc_session": cookie})
        assert first.status_code == 200, first.text
        our_rows_first = [g for g in first.json()["generated"] if g["description"] == "tscheck-recurring-rule"]
        assert len(our_rows_first) == 1, first.json()

        second = await aclient.post("/recurring/generate", cookies={"mc_session": cookie})
        assert second.status_code == 200, second.text
        our_rows_second = [g for g in second.json()["generated"] if g["description"] == "tscheck-recurring-rule"]
        assert len(our_rows_second) == 0, second.json()

        # cleanup: delete the generated expense
        expense_id = our_rows_first[0]["id"]
        await aclient.delete(f"/expenses/{expense_id}", cookies={"mc_session": cookie})
    finally:
        await aclient.delete(f"/recurring/{rule_id}", cookies={"mc_session": cookie})
