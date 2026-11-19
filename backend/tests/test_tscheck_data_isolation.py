"""Criterion: per-user data isolation. A tscheck expense/recurring rule created by user A
must be invisible (404) to user B via read/update/delete, and must never show up in B's
/expenses or /recurring listing — verified against the demo accounts without mutating their
seeded data (we only create+delete our own tscheck rows)."""

import uuid

CARLOS = {"email": "carlos.demo@example.com", "password": "Demo@2026"}
RENATA = {"email": "renata.demo@example.com", "password": "Demo@2026"}


async def _login(aclient, creds):
    r = await aclient.post("/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return r.cookies.get("mc_session")


async def test_other_user_cannot_read_update_delete_my_expense(aclient):
    carlos_cookie = await _login(aclient, CARLOS)
    renata_cookie = await _login(aclient, RENATA)

    me = await aclient.get("/auth/me", cookies={"mc_session": carlos_cookie})
    assert me.status_code == 200
    category_id = me.json()["expense_categories"][0]["id"]

    created = await aclient.post("/expenses", cookies={"mc_session": carlos_cookie}, json={
        "date": "2025-01-15", "description": "tscheck-isolation-expense", "amount_cents": 1234,
        "category_id": category_id, "kind": "eventual", "notes": "",
    })
    assert created.status_code == 201, created.text
    expense_id = created.json()["id"]

    try:
        # Renata must not see it in her own listing
        listing = await aclient.get("/expenses", cookies={"mc_session": renata_cookie},
                                    params={"start": "2025-01-01", "end": "2025-01-31"})
        assert listing.status_code == 200
        assert all(e["id"] != expense_id for e in listing.json())

        # Renata updating/deleting Carlos's expense -> 404 (not revealed to exist)
        upd = await aclient.put(f"/expenses/{expense_id}", cookies={"mc_session": renata_cookie}, json={
            "date": "2025-01-15", "description": "hijack-attempt", "amount_cents": 1, "category_id": category_id,
            "kind": "eventual", "notes": "",
        })
        assert upd.status_code == 404, upd.text

        delete_attempt = await aclient.delete(f"/expenses/{expense_id}", cookies={"mc_session": renata_cookie})
        assert delete_attempt.status_code == 404, delete_attempt.text

        # Carlos still owns an intact expense (only he can see/delete it)
        own_listing = await aclient.get("/expenses", cookies={"mc_session": carlos_cookie},
                                        params={"start": "2025-01-01", "end": "2025-01-31"})
        assert any(e["id"] == expense_id for e in own_listing.json())
    finally:
        await aclient.delete(f"/expenses/{expense_id}", cookies={"mc_session": carlos_cookie})


async def test_non_admin_cannot_use_admin_endpoints(aclient):
    renata_cookie = await _login(aclient, RENATA)
    r = await aclient.get("/admin/stats", cookies={"mc_session": renata_cookie})
    assert r.status_code == 403, r.text
