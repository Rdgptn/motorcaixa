import os
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

os.environ.setdefault("DOCUMENT_HASH_SECRET", "test-secret-with-at-least-32-characters")

from lib.identity import document_fingerprint, has_access, normalize_document, trial_ends_at, valid_cpf


def test_cpf_normalization_and_validation():
    assert normalize_document("529.982.247-25") == "52998224725"
    assert valid_cpf("529.982.247-25")
    assert not valid_cpf("111.111.111-11")


def test_same_document_has_same_fingerprint():
    assert document_fingerprint("cpf", "529.982.247-25") == document_fingerprint("cpf", "52998224725")


def test_trial_is_14_days_and_expiry_blocks():
    started = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert trial_ends_at(started, 14).isoformat() == "2026-01-15T00:00:00+00:00"
    assert has_access({"trial_ends_at": datetime(2026, 1, 15, tzinfo=timezone.utc)}, datetime(2026, 1, 14, tzinfo=timezone.utc))
    assert not has_access({"trial_ends_at": datetime(2026, 1, 15, tzinfo=timezone.utc)}, datetime(2026, 1, 15, tzinfo=timezone.utc))
    assert has_access({"subscription_status": "active", "trial_ends_at": datetime(2020, 1, 1, tzinfo=timezone.utc)})


def test_bad_document_is_rejected():
    with pytest.raises(HTTPException):
        document_fingerprint("cpf", "123")
