"""Criterion: signup creates a PENDING account; verify-email confirms via a token row;
reuse/expired tokens are rejected; unverified users get 403 on financial endpoints."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pytest


def _unique_email(label: str) -> str:
    return f"delivered+tscheck-{label}-{uuid.uuid4().hex[:8]}@resend.dev"


async def test_signup_pending_then_verify_email_token_flow(aclient, db):
    email = _unique_email("verify")
    password = "Senha1234"

    # Signup -> 202 generic message
    r = await aclient.post("/auth/signup", json={
        "name": "TSCheck Verify", "email": email, "password": password, "vehicle_type": "carro",
    })
    assert r.status_code == 202, r.text
    assert "e-mail" in r.json()["message"].lower()

    # Re-signup with the same email -> same generic 202 (no enumeration)
    r2 = await aclient.post("/auth/signup", json={
        "name": "TSCheck Verify", "email": email, "password": password, "vehicle_type": "carro",
    })
    assert r2.status_code == 202
    assert r2.json()["message"] == r.json()["message"]

    # Login works even before verification
    login = await aclient.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    cookie = login.cookies.get("mc_session")
    assert cookie

    # Unverified -> financial endpoint is 403
    dash = await aclient.get("/dashboard", cookies={"mc_session": cookie})
    assert dash.status_code == 403, dash.text

    # Craft a verify-email token the way the app does (sha256 of a raw secret)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    assert user is not None
    raw_token = secrets.token_urlsafe(32)
    await db.tokens.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "kind": "verify_email", "email": email,
        "token_hash": hashlib.sha256(raw_token.encode()).hexdigest(),
        "created_at": datetime.now(timezone.utc), "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "used_at": None,
    })

    verify = await aclient.post("/auth/verify-email", json={"token": raw_token})
    assert verify.status_code == 200, verify.text

    # Reusing the same (now used) token -> 400
    reuse = await aclient.post("/auth/verify-email", json={"token": raw_token})
    assert reuse.status_code == 400, reuse.text

    # Now the financial endpoint works
    dash2 = await aclient.get("/dashboard", cookies={"mc_session": cookie})
    assert dash2.status_code == 200, dash2.text


async def test_expired_verify_token_is_rejected(aclient, db):
    email = _unique_email("expired")
    password = "Senha1234"
    r = await aclient.post("/auth/signup", json={
        "name": "TSCheck Expired", "email": email, "password": password, "vehicle_type": "moto",
    })
    assert r.status_code == 202

    user = await db.users.find_one({"email": email}, {"_id": 0})
    assert user is not None
    raw_token = secrets.token_urlsafe(32)
    await db.tokens.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "kind": "verify_email", "email": email,
        "token_hash": hashlib.sha256(raw_token.encode()).hexdigest(),
        "created_at": datetime.now(timezone.utc) - timedelta(hours=48),
        "expires_at": datetime.now(timezone.utc) - timedelta(hours=1),  # already expired
        "used_at": None,
    })

    resp = await aclient.post("/auth/verify-email", json={"token": raw_token})
    assert resp.status_code == 400, resp.text
