"""Checkout e webhook de assinatura. Cartões nunca passam pelo MotorCaixa."""

import hashlib
import hmac
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from lib.database import db
from lib.auth_dependencies import get_current_user
from lib.identity import has_access
from lib.response_serializers import user_out

router = APIRouter(prefix="/billing", tags=["billing"])


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def configured() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY") and os.environ.get("STRIPE_PRICE_ID") and os.environ.get("STRIPE_WEBHOOK_SECRET"))


@router.get("/status")
async def status(user: dict = Depends(get_current_user)):
    return {
        "configured": configured(),
        "subscription_status": user.get("subscription_status", "trialing"),
        "trial_ends_at": user.get("trial_ends_at"),
        "access_blocked": not has_access(user),
    }


@router.get("/checkout")
async def checkout(user: dict = Depends(get_current_user)):
    if not configured():
        raise HTTPException(status_code=503, detail="Cobrança ainda não está configurada.")
    try:
        import stripe
        stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
        customer_id = user.get("stripe_customer_id")
        if not customer_id:
            customer = stripe.Customer.create(email=user["email"], name=user["name"], metadata={"user_id": user["id"]})
            customer_id = customer.id
            await db.users.update_one({"id": user["id"]}, {"$set": {"stripe_customer_id": customer_id}})
        session = stripe.checkout.Session.create(
            mode="subscription", customer=customer_id,
            line_items=[{"price": os.environ["STRIPE_PRICE_ID"], "quantity": 1}],
            success_url=f"{os.environ.get('APP_URL', '')}/app/ajustes?billing=success",
            cancel_url=f"{os.environ.get('APP_URL', '')}/app/ajustes?billing=cancelled",
            metadata={"user_id": user["id"]}, subscription_data={"metadata": {"user_id": user["id"]}},
        )
        return RedirectResponse(session.url, status_code=303)
    except ImportError:
        raise HTTPException(status_code=503, detail="Dependência de cobrança não instalada.")
    except Exception:
        raise HTTPException(status_code=502, detail="Não foi possível iniciar o checkout.")


@router.post("/webhook")
async def webhook(request: Request):
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(status_code=503, detail="Webhook não configurado.")
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        import stripe
        event = stripe.Webhook.construct_event(payload, signature, secret)
    except ImportError:
        raise HTTPException(status_code=503, detail="Dependência de cobrança não instalada.")
    except Exception:
        raise HTTPException(status_code=400, detail="Webhook inválido.")
    event_id = event["id"]
    event_type = event["type"]
    payload_hash = hashlib.sha256(payload).hexdigest()
    inserted = await db.webhook_events.update_one(
        {"provider_event_id": event_id},
        {"$setOnInsert": {"provider_event_id": event_id, "event_type": event_type, "payload_hash": payload_hash, "received_at": now_utc()}},
        upsert=True,
    )
    if not inserted.upserted_id:
        return {"received": True, "duplicate": True}
    obj = event["data"]["object"]
    metadata = obj.get("metadata", {}) or {}
    user_id = metadata.get("user_id")
    if not user_id and event_type.startswith("customer.subscription"):
        customer_id = obj.get("customer")
        customer = await db.users.find_one({"stripe_customer_id": customer_id}, {"_id": 0, "id": 1})
        user_id = customer.get("id") if customer else None
    if user_id:
        mapped = {"active": "active", "trialing": "trialing", "past_due": "past_due", "canceled": "canceled", "unpaid": "past_due"}
        if event_type == "checkout.session.completed":
            status = "active"
        elif event_type.startswith("customer.subscription"):
            status = mapped.get(obj.get("status"), "expired")
        elif event_type == "invoice.payment_failed":
            status = "past_due"
        else:
            status = None
        if status:
            await db.users.update_one({"id": user_id}, {"$set": {"subscription_status": status, "plan": "pro" if status == "active" else "free", "subscription_updated_at": now_utc()}})
    await db.webhook_events.update_one({"provider_event_id": event_id}, {"$set": {"processed_at": now_utc()}})
    return {"received": True}
