"""Criterion: login/logout/password-reset security.

Wrong password -> generic 401; session cookie is httpOnly `mc_session`; logout clears it so
/api/auth/me -> 401 afterwards; forgot-password always 202 with a generic message (no
enumeration of existing vs. non-existing emails).

Single signup reused across assertions to stay well under the signup rate limit (10/h/IP)."""

import uuid


async def test_login_logout_and_forgot_password_security(aclient):
    email = f"delivered+tscheck-loginsec-{uuid.uuid4().hex[:8]}@resend.dev"
    password = "Senha1234"
    signup = await aclient.post("/auth/signup", json={
        "name": "TSCheck LoginSec", "email": email, "password": password, "vehicle_type": "carro",
    })
    assert signup.status_code == 202, signup.text

    # Wrong password -> generic 401, same message for a non-existing email (anti-enumeration)
    wrong = await aclient.post("/auth/login", json={"email": email, "password": "WrongPass123"})
    assert wrong.status_code == 401, wrong.text
    assert wrong.json()["detail"] == "E-mail ou senha inválidos."

    ghost = await aclient.post("/auth/login", json={"email": "delivered+tscheck-noone@resend.dev", "password": "WrongPass123"})
    assert ghost.status_code == 401
    assert ghost.json()["detail"] == wrong.json()["detail"]

    # Correct login -> httpOnly session cookie
    login = await aclient.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    set_cookie_header = login.headers.get("set-cookie", "")
    assert "mc_session=" in set_cookie_header
    assert "httponly" in set_cookie_header.lower()

    cookie = login.cookies.get("mc_session")
    me = await aclient.get("/auth/me", cookies={"mc_session": cookie})
    assert me.status_code == 200, me.text

    # Logout clears the session -> subsequent /auth/me is 401
    logout = await aclient.post("/auth/logout", cookies={"mc_session": cookie})
    assert logout.status_code == 200, logout.text
    assert "mc_session=" in logout.headers.get("set-cookie", "")

    me_after = await aclient.get("/auth/me", cookies={"mc_session": cookie})
    assert me_after.status_code == 401, me_after.text

    # forgot-password: always 202, identical generic message for existing vs. non-existing email
    fp1 = await aclient.post("/auth/forgot-password", json={"email": email})
    assert fp1.status_code == 202, fp1.text
    fp2 = await aclient.post("/auth/forgot-password", json={"email": "delivered+tscheck-noone2@resend.dev"})
    assert fp2.status_code == 202, fp2.text
    assert fp1.json()["message"] == fp2.json()["message"]
