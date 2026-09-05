import asyncio
import logging
import os
from datetime import datetime, timezone
from html import escape
from typing import List, Optional

import resend

logger = logging.getLogger(__name__)

RESEND_API_KEY = ""
EMAIL_FROM = ""
NOTIFY_EMAIL = ""
EMAIL_ENABLED = False

_db = None
_public_url = ""


def configure(db, public_url: str):
    global _db, _public_url, RESEND_API_KEY, EMAIL_FROM, NOTIFY_EMAIL, EMAIL_ENABLED
    _db = db
    _public_url = public_url.rstrip("/")
    RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
    EMAIL_FROM = os.environ.get("EMAIL_FROM", "").strip()
    NOTIFY_EMAIL = os.environ.get("NOTIFY_EMAIL", "").strip()
    EMAIL_ENABLED = bool(RESEND_API_KEY and EMAIL_FROM)
    if EMAIL_ENABLED:
        resend.api_key = RESEND_API_KEY


def _money(v) -> str:
    return f"${float(v):.2f}"


def layout(title: str, body: str, preheader: str = "") -> str:
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#171717;">
<span style="display:none;max-height:0;overflow:hidden;">{escape(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0a0a0a;padding:22px 32px;">
  <img src="{_public_url}/img/logo.png" alt="" width="40" height="40" style="vertical-align:middle;border-radius:50%;margin-right:10px;">
  <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;vertical-align:middle;">Puff<span style="color:#10b981;">2</span>Door</span>
  <span style="display:block;font-size:10px;letter-spacing:3px;color:#a3a3a3;text-transform:uppercase;margin-top:2px;">Puffs delivered to your door</span>
</td></tr>
<tr><td style="padding:32px;">
  <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#171717;">{escape(title)}</h1>
  {body}
</td></tr>
<tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e5e5e5;font-size:12px;color:#737373;line-height:1.6;">
  Questions? Reply to this email or reach us at puff2door@gmail.com · (407) 625-6826.<br>
  You must be 21+ to purchase. Puff2Door · 12915 Narcoossee Rd, Orlando, FL 32832.
</td></tr>
</table></td></tr></table></body></html>"""


def button(text: str, href: str) -> str:
    return f'<a href="{escape(href)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:999px;font-size:14px;">{escape(text)}</a>'


def items_table(order: dict) -> str:
    rows = "".join(
        f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;">{escape(i["name"])}<span style="color:#737373;"> × {i["qty"]}</span></td>'
        f'<td align="right" style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;">{_money(i["price"] * i["qty"])}</td></tr>'
        for i in order["items"]
    )
    ship = "FREE" if not order.get("shippingCost") else _money(order["shippingCost"])
    tax_row = f'<tr><td style="padding:4px 0;font-size:14px;color:#737373;">Sales tax ({order.get("taxRate", 0) * 100:g}%)</td><td align="right" style="padding:4px 0;font-size:14px;">{_money(order["tax"])}</td></tr>' if order.get("tax") else ""
    disc_row = f'<tr><td style="padding:4px 0;font-size:14px;color:#059669;">Discount {escape(order.get("promoCode") or "")}</td><td align="right" style="padding:4px 0;font-size:14px;color:#059669;">-{_money(order["discount"])}</td></tr>' if order.get("discount") else ""
    reward_row = f'<tr><td style="padding:4px 0;font-size:14px;color:#059669;">Puff2door Rewards ({order.get("rewardPoints", 0)} pts)</td><td align="right" style="padding:4px 0;font-size:14px;color:#059669;">-{_money(order["rewardDiscount"])}</td></tr>' if order.get("rewardDiscount") else ""
    return f"""<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;">{rows}
<tr><td style="padding:8px 0;font-size:14px;color:#737373;">Subtotal</td><td align="right" style="padding:8px 0;font-size:14px;">{_money(order["subtotal"])}</td></tr>
{disc_row}{reward_row}<tr><td style="padding:4px 0;font-size:14px;color:#737373;">Delivery</td><td align="right" style="padding:4px 0;font-size:14px;">{ship}</td></tr>
{tax_row}<tr><td style="padding:10px 0;font-size:18px;font-weight:800;">Total</td><td align="right" style="padding:10px 0;font-size:18px;font-weight:800;">{_money(order["total"])}</td></tr>
</table>"""


def zelle_box(recipient: str, name: str, amount, memo: str) -> str:
    return f"""<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:18px;margin:16px 0;">
<p style="margin:0 0 10px;font-weight:800;color:#065f46;">Complete your payment with Zelle</p>
<p style="margin:0 0 12px;font-size:13px;color:#374151;">Open your bank app, choose Zelle and send the exact amount below. Put the order number in the memo so we can match it. Your order ships once payment arrives.</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="font-size:14px;">
<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Send to</td><td style="font-weight:700;font-family:monospace;">{escape(recipient)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Recipient</td><td style="font-weight:700;">{escape(name)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Amount</td><td style="font-weight:700;font-family:monospace;">{_money(amount)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Memo</td><td style="font-weight:700;font-family:monospace;">{escape(memo)}</td></tr>
</table></div>"""


def address_block(s: dict) -> str:
    parts = [f'{s.get("firstName", "")} {s.get("lastName", "")}'.strip(), s.get("address", ""), f'{s.get("city", "")}, {s.get("state", "")} {s.get("zip", "")}'.strip(", "), s.get("phone", "")]
    return "<br>".join(escape(p) for p in parts if p and p.strip(", "))


PAY_LABEL = {"square": "card", "cash_app": "Cash App Pay", "paypal": "PayPal", "zelle": "Zelle", "test_card": "test card"}
STATUS_COPY = {
    "confirmed": ("Your order is confirmed", "We've received your payment and are getting your order ready."),
    "out_for_delivery": ("Your order is out for delivery", "Your Puff2Door order is on its way. Keep your ID handy — deliveries are 21+ only."),
    "delivered": ("Your order has been delivered", "Enjoy! If anything isn't right, just reply to this email."),
}


TEST_DOMAINS = ("example.com", "example.org", "test.local")


def is_test_address(addr: Optional[str]) -> bool:
    return not addr or addr.lower().rsplit("@", 1)[-1] in TEST_DOMAINS


async def _send(to: List[str], subject: str, html: str, kind: str, meta: Optional[dict] = None) -> Optional[str]:
    to = [t for t in to if t]
    record = {"to": to, "subject": subject, "kind": kind, "meta": meta or {}, "createdAt": datetime.now(timezone.utc), "status": "skipped"}
    if not to:
        return None
    if any(is_test_address(t) for t in to):
        record["status"] = "skipped"
        record["error"] = "Test address – not sent"
    elif not EMAIL_ENABLED:
        record["status"] = "disabled"
        logger.info("Email disabled – would send '%s' to %s", subject, to)
    else:
        try:
            res = await asyncio.to_thread(resend.Emails.send, {"from": EMAIL_FROM, "to": to, "subject": subject, "html": html})
            record.update({"status": "sent", "providerId": res.get("id") if isinstance(res, dict) else str(res)})
        except Exception as e:  # never break the calling flow
            record.update({"status": "failed", "error": str(e)[:500]})
            logger.error("Email '%s' to %s failed: %s", subject, to, e)
    if _db is not None:
        try:
            await _db.email_log.insert_one(record)
        except Exception:
            pass
    return record["status"]


def order_link(order: dict) -> str:
    return f"{_public_url}/order/{order['id']}"


async def send_order_confirmation(order: dict, zelle: Optional[dict] = None):
    to = order.get("shipping", {}).get("email")
    n = order["orderNumber"]
    awaiting = order.get("paymentStatus") == "awaiting_payment"
    title = f"Order {n} received — payment pending" if awaiting else f"Thanks for your order {n}!"
    intro = ("We've saved your order. It ships as soon as your Zelle payment arrives." if awaiting
             else f"We've received your payment via {PAY_LABEL.get(order.get('paymentMethod'), 'card')} and are getting things ready.")
    body = f'<p style="font-size:15px;line-height:1.6;color:#374151;">Hi {escape(order["shipping"].get("firstName") or "there")}, {intro}</p>'
    if awaiting and zelle:
        body += zelle_box(zelle["recipient"], zelle["name"], zelle["amount"], zelle["memo"])
    body += items_table(order)
    body += f'<p style="font-size:13px;color:#6b7280;margin:0 0 6px;"><strong style="color:#171717;">Delivering to</strong><br>{address_block(order["shipping"])}</p>'
    body += f'<p style="margin:24px 0 0;">{button("Track your order", order_link(order))}</p>'
    await _send([to], title, layout(title, body, intro), "order_confirmation", {"orderId": order["id"]})
    await notify_admin_new_order(order)


async def notify_admin_new_order(order: dict):
    if not NOTIFY_EMAIL or is_test_address(order.get("shipping", {}).get("email")):
        return
    n = order["orderNumber"]
    s = order["shipping"]
    pay = "UNPAID – Zelle pending" if order.get("paymentStatus") == "awaiting_payment" else f"paid via {PAY_LABEL.get(order.get('paymentMethod'), 'card')}"
    title = f"New order {n} · {_money(order['total'])} · {pay}"
    body = f'<p style="font-size:14px;color:#374151;">{escape(s.get("firstName", ""))} {escape(s.get("lastName", ""))} · {escape(s.get("email", ""))} · {escape(s.get("phone", ""))}</p>'
    body += items_table(order)
    body += f'<p style="font-size:13px;color:#6b7280;">{address_block(s)}</p>'
    body += f'<p style="margin:20px 0 0;">{button("Open in admin", f"{_public_url}/admin/orders")}</p>'
    await _send([NOTIFY_EMAIL], title, layout(title, body), "admin_new_order", {"orderId": order["id"]})


async def send_payment_received(order: dict):
    to = order.get("shipping", {}).get("email")
    n = order["orderNumber"]
    title = f"Payment received — order {n} is confirmed"
    body = f'<p style="font-size:15px;line-height:1.6;color:#374151;">Hi {escape(order["shipping"].get("firstName") or "there")}, we\'ve received your {PAY_LABEL.get(order.get("paymentMethod"), "")} payment of <strong>{_money(order["total"])}</strong>. Your order is confirmed and being prepared.</p>'
    body += items_table(order)
    body += f'<p style="margin:24px 0 0;">{button("Track your order", order_link(order))}</p>'
    await _send([to], title, layout(title, body), "payment_received", {"orderId": order["id"]})


async def send_status_update(order: dict, status: str):
    if status not in STATUS_COPY:
        return
    to = order.get("shipping", {}).get("email")
    title, copy = STATUS_COPY[status]
    subject = f"{title} — {order['orderNumber']}"
    body = f'<p style="font-size:15px;line-height:1.6;color:#374151;">Hi {escape(order["shipping"].get("firstName") or "there")}, {copy}</p>'
    body += f'<p style="font-size:13px;color:#6b7280;">{len(order["items"])} item(s) · {_money(order["total"])}</p>'
    body += f'<p style="margin:24px 0 0;">{button("View delivery tracker", order_link(order))}</p>'
    await _send([to], subject, layout(title, body, copy), f"status_{status}", {"orderId": order["id"]})


async def send_password_reset(email: str, first_name: str, token: str, minutes: int):
    link = f"{_public_url}/my-account?reset_token={token}"
    title = "Reset your Puff2Door password"
    body = f'<p style="font-size:15px;line-height:1.6;color:#374151;">Hi {escape(first_name or "there")}, click below to choose a new password. This link expires in {minutes} minutes. If you didn\'t request this, you can ignore this email.</p>'
    body += f'<p style="margin:24px 0;">{button("Reset password", link)}</p>'
    body += f'<p style="font-size:12px;color:#9ca3af;word-break:break-all;">{escape(link)}</p>'
    return await _send([email], title, layout(title, body), "password_reset", {"email": email})


async def send_restock_alert(email: str, product: dict):
    link = f"{_public_url}/shop/{product['slug']}"
    title = f"Back in stock: {product['name']}"
    body = f'<p style="font-size:15px;line-height:1.6;color:#374151;">Good news — <strong>{escape(product["name"])}</strong> is available again at {_money(product.get("salePrice") or product["price"])}. Stock is limited, so grab it while you can.</p>'
    body += f'<p style="margin:24px 0 0;">{button("Shop now", link)}</p>'
    return await _send([email], title, layout(title, body), "restock_alert", {"productId": product["id"], "email": email})
