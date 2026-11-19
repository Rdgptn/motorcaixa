"""Criterion: PUT /days/{date} upserts (second save replaces, never duplicates), day_off
marks 'folga', and a future date is rejected with 422."""

CARLOS = {"email": "carlos.demo@example.com", "password": "Demo@2026"}
TEST_DATE = "2024-03-05"  # well outside the ~49-day seeded window, created/cleaned by this test only


async def _login(aclient, creds):
    r = await aclient.post("/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return r.cookies.get("mc_session")


async def test_day_put_upserts_without_duplicating_and_rejects_future_date(aclient):
    cookie = await _login(aclient, CARLOS)
    me = await aclient.get("/auth/me", cookies={"mc_session": cookie})
    assert me.status_code == 200
    source_id = me.json()["income_sources"][0]["id"]

    try:
        first = await aclient.put(f"/days/{TEST_DATE}", cookies={"mc_session": cookie}, json={
            "day_off": False, "km": 10, "notes": "tscheck first save",
            "entries": [{"source_id": source_id, "amount_cents": 5000}],
        })
        assert first.status_code == 200, first.text
        assert first.json()["total_cents"] == 5000

        # Second save on the SAME date replaces, never duplicates
        second = await aclient.put(f"/days/{TEST_DATE}", cookies={"mc_session": cookie}, json={
            "day_off": False, "km": 20, "notes": "tscheck replaced",
            "entries": [{"source_id": source_id, "amount_cents": 9000}],
        })
        assert second.status_code == 200, second.text
        assert second.json()["total_cents"] == 9000
        assert second.json()["notes"] == "tscheck replaced"

        month = TEST_DATE[:7]
        listing = await aclient.get("/days", cookies={"mc_session": cookie}, params={"month": month})
        matching = [d for d in listing.json()["days"] if d["date"] == TEST_DATE]
        assert len(matching) == 1, matching  # never duplicated
        assert matching[0]["total_cents"] == 9000

        # day_off marks folga (entries cleared, total 0)
        folga = await aclient.put(f"/days/{TEST_DATE}", cookies={"mc_session": cookie}, json={
            "day_off": True, "notes": "", "entries": [],
        })
        assert folga.status_code == 200, folga.text
        assert folga.json()["day_off"] is True
        assert folga.json()["total_cents"] == 0

        # Future date -> 422
        future = await aclient.put("/days/2099-01-01", cookies={"mc_session": cookie}, json={
            "day_off": False, "notes": "", "entries": [{"source_id": source_id, "amount_cents": 100}],
        })
        assert future.status_code == 422, future.text
    finally:
        await aclient.delete(f"/days/{TEST_DATE}", cookies={"mc_session": cookie})
