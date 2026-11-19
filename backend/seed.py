"""Dados de DEMONSTRAÇÃO (separados dos reais). Rode: cd /app/backend && python seed.py

- Idempotente: pode rodar várias vezes.
- Contas demo usam o domínio reservado example.com (nunca recebem e-mail) e têm is_demo=True,
  exibido na interface como "Conta de demonstração".
- Só os lançamentos das contas demo são recriados; nenhum dado real é tocado.
"""

import asyncio
import os
import random
import uuid
from datetime import date, timedelta

from lib.db import db, ensure_indexes
from lib.defaults import default_categories, default_sources
from lib.security import hash_password, now_utc

ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@motorcaixa.com.br")
ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "Admin@2026")
DEMO_PASSWORD = "Demo@2026"


async def upsert_user(email: str, name: str, vehicle: str, password: str, role: str, demo: bool) -> dict:
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    base = {
        "name": name, "email": email, "password_hash": hash_password(password), "vehicle_type": vehicle,
        "verified_email": email, "role": role, "status": "active", "is_demo": demo,
        "report_opt_in": False if demo or role == "admin" else True,
    }
    if existing:
        await db.users.update_one({"id": existing["id"]}, {"$set": base})
        return {**existing, **base}
    user = {
        "id": str(uuid.uuid4()), **base, "email_verified_at": now_utc(), "plan": "free",
        "timezone": "America/Sao_Paulo", "report_attach": True,
        "income_sources": default_sources(vehicle), "expense_categories": default_categories(vehicle),
        "created_at": now_utc(), "last_login_at": None,
    }
    await db.users.insert_one(user)
    return user


async def fill_demo(user: dict, ranges: dict[str, tuple[int, int]], seed: int) -> None:
    rnd = random.Random(seed)
    uid = user["id"]
    await db.days.delete_many({"user_id": uid})
    await db.expenses.delete_many({"user_id": uid})
    await db.recurring.delete_many({"user_id": uid})
    names = {s["id"]: s["name"] for s in user["income_sources"]}
    cats = {c["id"]: c["name"] for c in user["expense_categories"]}
    today = date.today()
    for back in range(1, 50):
        d = today - timedelta(days=back)
        if back in (3, 4):  # deixa 2 dias "sem registro" de propósito
            continue
        if d.weekday() == 6:  # domingo de folga
            await db.days.insert_one({"user_id": uid, "date": d.isoformat(), "day_off": True, "km": None,
                                      "notes": "", "entries": [], "total_cents": 0, "updated_at": now_utc()})
            continue
        entries = []
        for sid, (lo, hi) in ranges.items():
            if rnd.random() < 0.85:
                entries.append({"source_id": sid, "source_name": names[sid], "amount_cents": rnd.randint(lo, hi) * 100})
        await db.days.insert_one({"user_id": uid, "date": d.isoformat(), "day_off": False,
                                  "km": float(rnd.randint(90, 220)), "notes": "", "entries": entries,
                                  "total_cents": sum(e["amount_cents"] for e in entries), "updated_at": now_utc()})
        if rnd.random() < 0.6:
            await db.expenses.insert_one({
                "id": str(uuid.uuid4()), "user_id": uid, "date": d.isoformat(), "category_id": "combustivel",
                "category_name": cats["combustivel"], "description": "Abastecimento",
                "amount_cents": rnd.randint(40, 120) * 100, "kind": "diaria", "notes": "", "recurring_id": None,
                "created_at": now_utc()})
        if rnd.random() < 0.3:
            await db.expenses.insert_one({
                "id": str(uuid.uuid4()), "user_id": uid, "date": d.isoformat(), "category_id": "alimentacao",
                "category_name": cats["alimentacao"], "description": "Almoço",
                "amount_cents": rnd.randint(18, 35) * 100, "kind": "diaria", "notes": "", "recurring_id": None,
                "created_at": now_utc()})
    await db.recurring.insert_one({
        "id": str(uuid.uuid4()), "user_id": uid, "description": "Plano de celular", "category_id": "internet",
        "category_name": cats["internet"], "amount_cents": 6990, "day_of_month": 10, "active": True,
        "notes": "", "last_generated_month": None, "created_at": now_utc()})


async def main() -> None:
    await ensure_indexes()
    await upsert_user(ADMIN_EMAIL, "Administrador", "carro", ADMIN_PASSWORD, "admin", False)
    carlos = await upsert_user("carlos.demo@example.com", "Carlos (demo)", "carro", DEMO_PASSWORD, "user", True)
    renata = await upsert_user("renata.demo@example.com", "Renata (demo)", "moto", DEMO_PASSWORD, "user", True)
    await fill_demo(carlos, {"uber": (120, 260), "99": (40, 110), "particular": (0, 120)}, 1)
    await fill_demo(renata, {"ifood": (110, 230), "uber": (20, 80), "particular": (0, 60)}, 2)
    print("Seed concluído:", ADMIN_EMAIL, "| demos: carlos.demo@example.com, renata.demo@example.com")


if __name__ == "__main__":
    asyncio.run(main())
