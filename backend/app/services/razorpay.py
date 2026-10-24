"""Minimal Razorpay client: create orders and verify signatures.

Docs: https://razorpay.com/docs/api/orders/ and
https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
"""

import hashlib
import hmac
from decimal import Decimal

import httpx

from app.core.config import get_settings
from app.core.errors import AppError


def _require_enabled():
    settings = get_settings()
    if not settings.razorpay_enabled:
        raise AppError(503, "Online payments are not set up for this clinic yet", "PAYMENTS_DISABLED")
    return settings


def to_paise(amount: Decimal) -> int:
    return int((amount * 100).quantize(Decimal("1")))


def create_order(amount: Decimal, receipt: str, notes: dict[str, str]) -> dict:
    """Create a Razorpay order. Returns the order JSON (id, amount, currency...)."""
    settings = _require_enabled()
    try:
        res = httpx.post(
            f"{settings.razorpay_api_base}/orders",
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            json={
                "amount": to_paise(amount),
                "currency": settings.currency,
                "receipt": receipt[:40],
                "notes": notes,
                "payment_capture": 1,
            },
            timeout=15,
        )
    except httpx.HTTPError:
        raise AppError(502, "Could not reach the payment gateway. Try again in a moment.", "GATEWAY_UNREACHABLE")
    if res.status_code >= 400:
        raise AppError(502, "The payment gateway rejected the request", "GATEWAY_ERROR")
    return res.json()


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Signature sent to the browser after checkout: HMAC-SHA256(order_id|payment_id, key_secret)."""
    settings = _require_enabled()
    expected = hmac.new(
        settings.razorpay_key_secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def verify_webhook_signature(body: bytes, signature: str | None) -> bool:
    """X-Razorpay-Signature header: HMAC-SHA256(raw body, webhook secret)."""
    secret = get_settings().razorpay_webhook_secret
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
