"""Backfill único para contas criadas antes da regra de assinatura.

Por padrão, concede 14 dias a partir do momento da migração. Execute com revisão,
backup e janela de manutenção; nunca rode automaticamente no startup.
"""
import asyncio
from datetime import timedelta
from lib.database import db
from lib.security import now_utc

async def main() -> None:
    started = now_utc()
    result = await db.users.update_many(
        {"trial_ends_at": {"$exists": False}, "plan": {"$ne": "pro"}, "role": {"$ne": "admin"}},
        {"$set": {"trial_started_at": started, "trial_ends_at": started + timedelta(days=14), "subscription_status": "trialing"}},
    )
    print(f"backfilled={result.modified_count} started_at={started.isoformat()}")

if __name__ == "__main__":
    asyncio.run(main())
