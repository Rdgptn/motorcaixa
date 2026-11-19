"""Criterion: monthly XLSX email automation endpoint is protected and idempotent per
X-Webhook-Id — no Bearer -> 401; valid Bearer -> 202 accepted; replaying the same
X-Webhook-Id -> duplicate (no second job enqueued)."""

import os
import uuid


async def test_cron_daily_requires_bearer_and_is_idempotent_per_webhook_id(aclient):
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    assert secret, "WEBHOOK_CRON_SECRET must be set in backend/.env for this check to be meaningful"

    no_auth = await aclient.post("/cron/daily", json={})
    assert no_auth.status_code == 401, no_auth.text

    wrong_auth = await aclient.post("/cron/daily", json={}, headers={"Authorization": "Bearer wrong-secret"})
    assert wrong_auth.status_code == 401, wrong_auth.text

    webhook_id = f"tscheck-cron-{uuid.uuid4().hex[:10]}"
    headers = {"Authorization": f"Bearer {secret}", "X-Webhook-Id": webhook_id}

    first = await aclient.post("/cron/daily", json={}, headers=headers)
    assert first.status_code == 202, first.text
    assert first.json()["status"] == "accepted"

    duplicate = await aclient.post("/cron/daily", json={}, headers=headers)
    assert duplicate.status_code == 202, duplicate.text
    assert duplicate.json()["status"] == "duplicate"
