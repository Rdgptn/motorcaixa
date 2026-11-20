"""Identidade mínima para impedir contas duplicadas sem armazenar CPF/RG puro."""

import hashlib
import hmac
import os
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException


def normalize_document(value: str) -> str:
    return re.sub(r"[^0-9A-Z]", "", str(value or "").upper().strip())


def valid_cpf(value: str) -> bool:
    digits = normalize_document(value)
    if not digits.isdigit() or len(digits) != 11 or len(set(digits)) == 1:
        return False
    total = sum(int(digits[i]) * (10 - i) for i in range(9))
    first = (total * 10 % 11) % 10
    total = sum(int(digits[i]) * (11 - i) for i in range(10))
    second = (total * 10 % 11) % 10
    return digits[-2:] == f"{first}{second}"


def document_fingerprint(document_type: str, value: str) -> str:
    normalized = normalize_document(value)
    if document_type == "cpf":
        if not valid_cpf(normalized):
            raise HTTPException(status_code=422, detail="Documento inválido.")
    elif document_type == "rg":
        if not (5 <= len(normalized) <= 14) or not re.fullmatch(r"[0-9A-Z]+", normalized):
            raise HTTPException(status_code=422, detail="Documento inválido.")
    else:
        raise HTTPException(status_code=422, detail="Tipo de documento inválido.")
    secret = os.environ.get("DOCUMENT_HASH_SECRET", "")
    if len(secret) < 32:
        raise HTTPException(status_code=503, detail="Serviço de identidade não configurado.")
    # Não inclui o tipo no HMAC: o fingerprint representa a identidade cadastrada.
    return hmac.new(secret.encode(), normalized.encode(), hashlib.sha256).hexdigest()


def trial_ends_at(started_at: datetime, days: int = 14) -> datetime:
    return started_at + timedelta(days=days)


def aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def has_access(user: dict, now: datetime | None = None) -> bool:
    if user.get("role") == "admin" or user.get("subscription_status") == "active" or user.get("plan") == "pro":
        return True
    ends = aware(user.get("trial_ends_at"))
    return bool(ends and ends > (now or datetime.now(timezone.utc)))
