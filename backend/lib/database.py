"""Conexão compartilhada com MongoDB e índices de integridade."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "users": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("document_fingerprint", ASCENDING)], name="document_fingerprint", unique=True, sparse=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "sessions": [
        IndexModel([("token_hash", ASCENDING)], name="token_hash", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id"),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "tokens": [
        IndexModel([("token_hash", ASCENDING)], name="token_hash", unique=True),
        IndexModel([("user_id", ASCENDING), ("kind", ASCENDING)], name="user_kind"),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=86400),
    ],
    "rate_limits": [
        IndexModel([("key", ASCENDING)], name="key", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    # Um documento por usuário+dia: impede faturamento duplicado no mesmo dia.
    "days": [IndexModel([("user_id", ASCENDING), ("date", ASCENDING)], name="user_date", unique=True)],
    "expenses": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("user_id", ASCENDING), ("date", DESCENDING)], name="user_date"),
        # Uma regra recorrente gera no máximo uma despesa por mês (competência).
        IndexModel([("user_id", ASCENDING), ("recurring_id", ASCENDING), ("competence", ASCENDING)],
                   name="recurring_once", unique=True,
                   partialFilterExpression={"recurring_id": {"$type": "string"}}),
    ],
    "recurring": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("user_id", ASCENDING), ("active", ASCENDING)], name="user_active"),
    ],
    "report_runs": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        # Idempotência do envio automático: 1 por usuário+período.
        IndexModel([("user_id", ASCENDING), ("period", ASCENDING), ("trigger_key", ASCENDING)],
                   name="user_period_trigger", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "email_logs": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "audit_logs": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "cron_runs": [IndexModel([("run_id", ASCENDING)], name="run_id", unique=True)],
    "webhook_events": [IndexModel([("provider_event_id", ASCENDING)], name="provider_event_id", unique=True),
                       IndexModel([("received_at", DESCENDING)], name="received_desc")],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
