"""Business expenses gathered from Gmail receipts (read-only Gmail access, free).

Connect one or more Gmail inboxes from the admin (Google sign-in, gmail.readonly).
  * A "business" inbox (puff2door@gmail.com): every receipt/invoice it finds is imported.
  * A "personal" inbox: only mail from senders the owner approved is imported.
Each receipt keeps: vendor, date, amount, invoice number, category, a link back to the
email and the names of any PDF attachments (downloaded on demand, never stored).
Owner edits teach the vendor's category for next time (`expense_vendor_rules`).
Emails are never changed, moved or deleted.
"""
from __future__ import annotations

import base64
import hashlib
import html as html_lib
import re
import secrets
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr, parsedate_to_datetime
from typing import Optional
from urllib.parse import quote, urlencode

import httpx
from cryptography.fernet import Fernet

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = "https://www.googleapis.com/auth/gmail.readonly openid email"
GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
QUERY = ('(receipt OR invoice OR "payment received" OR "payment confirmation" OR "your bill" OR "amount due" OR '
         '"order confirmation" OR "thank you for your payment" OR "billing statement" OR "utility bill" OR subject:bill) '
         '-category:promotions -in:sent -in:chats')

CATEGORIES = [
    "Inventory & suppliers", "Utilities", "Rent & property", "Government, taxes & licenses", "Insurance",
    "Software & subscriptions", "Bank & card fees", "Professional services", "Store supplies & equipment",
    "Repairs & maintenance", "Shipping & delivery", "Marketing & advertising", "Other",
]
RULES = [  # (category, pattern on sender email/name + subject)
    ("Utilities", r"duke-?energy|\bfpl\b|\bouc\b|ouc\.com|electric|water|sewer|utility|spectrum|xfinity|comcast|\bat&?t\b|"
                  r"att-mail|verizon|t-mobile|waste|internet"),
    ("Government, taxes & licenses", r"\.gov\b|floridarevenue|\birs\b|sunbiz|tax collector|county|city of|altamonte\.org|"
                                     r"\bdbpr\b|license|myflorida|department of|fdacs|annual report"),
    ("Rent & property", r"\brent\b|lease|landlord|property management|realty|plaza|properties"),
    ("Insurance", r"insurance|insure|premium ?finance|gotopremium|pbsnetaccess|geico|state ?farm|progressive|allstate|next ?insurance|hiscox|liberty mutual|thimble"),
    ("Professional services", r"\bcpa\b|accounting|bookkeep|law office|attorney|legal|clio|consult|yashcon"),
    ("Bank & card fees", r"\bbank\b|\bchase\b|wells ?fargo|bank of america|\bfee\b|merchant statement|clover fees|fiserv|"
                         r"stripe|square|paypal|interest charge"),
    ("Software & subscriptions", r"render\.com|mongodb|github|google (workspace|cloud|one)|resend|godaddy|namecheap|"
                                 r"cloudflare|apple|microsoft|adobe|canva|openai|anthropic|claude|shopify|clover app|"
                                 r"subscription|fly\.io|vercel|zoom|quickbooks|intuit"),
    ("Marketing & advertising", r"facebook ads|meta ads|google ads|yelp|vistaprint|marketing|advertis|instagram"),
    ("Shipping & delivery", r"\bups\b|fedex|usps|dhl|shipping label|pirate ?ship|uber|doordash|lyft"),
    ("Repairs & maintenance", r"repair|plumb|hvac|electrician|locksmith|maintenance|pest|vivint|alarm|security system"),
    ("Store supplies & equipment", r"lowe'?s|home ?depot|staples|office ?depot|walmart|costco|sam'?s club|amazon|target|"
                                   r"best buy|uline|webstaurant"),
    ("Inventory & suppliers", r"distribut|novelty|wholesale|supply|supplies|vape|smoke|hemp|cbd|kratom|tobacco|cigar|"
                              r"glass|hookah|geek ?bar|lost ?mary|raz|elf ?bar|nexa|smok|grabba|backwoods"),
]
SKIP = re.compile(r"verification code|verify your|sign in|password|security alert|newsletter|digest|"
                  r"two-factor|2-step|welcome to|shipped|out for delivery|delivered:|\bquote\b|quotation|estimate|"
                  r"payment received from|you received|money received|sent you|credit on your|refund|cancell?ation|"
                  r"notice of acceptance|application received", re.I)
BILL_WORDS = re.compile(r"invoice|receipt|bill|statement|payment|paid|order|fee|premium|due", re.I)
AMOUNT_KEYS = r"(?:grand total|total (?:amount )?(?:paid|due|charged)?|amount (?:paid|due|charged)|balance due|" \
              r"payment (?:amount|of)|you paid|order total|total|fees?(?: due| amount)?)"
MONEY = r"\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))"


class GmailError(Exception):
    pass


def _now():
    return datetime.now(timezone.utc)


# ---------------- parsing ----------------
def _decode(data: str) -> str:
    try:
        return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", "replace")
    except Exception:
        return ""


def _walk(part: dict, texts: list, htmls: list, files: list):
    mime = part.get("mimeType", "")
    body = part.get("body") or {}
    if part.get("filename") and body.get("attachmentId"):
        files.append({"name": part["filename"], "attachmentId": body["attachmentId"], "mime": mime, "size": body.get("size", 0)})
    elif mime == "text/plain" and body.get("data"):
        texts.append(_decode(body["data"]))
    elif mime == "text/html" and body.get("data"):
        htmls.append(_decode(body["data"]))
    for p in part.get("parts") or []:
        _walk(p, texts, htmls, files)


def _strip_html(h: str) -> str:
    h = re.sub(r"(?is)<(script|style).*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d)>", "\n", h)
    h = re.sub(r"<[^>]+>", " ", h)
    return html_lib.unescape(h)


def find_amount(text: str) -> Optional[float]:
    t = re.sub(r"[ \t ]+", " ", text)
    best = None
    for m in re.finditer(AMOUNT_KEYS + r"[^$\n]{0,40}" + MONEY, t, re.I):
        val = float(m.group(1).replace(",", ""))
        label = m.group(0).lower()
        score = 3 if re.search(r"grand total|amount paid|you paid|total paid|amount due|balance due|payment of", label) else 2
        if 0 < val < 100000 and (best is None or score > best[0] or (score == best[0] and val > best[1])):
            best = (score, val)
    if best:
        return round(best[1], 2)
    vals = [float(v.replace(",", "")) for v in re.findall(MONEY, t)]
    vals = [v for v in vals if 0 < v < 100000]
    return round(vals[0], 2) if len(set(vals)) == 1 else None  # only when the email shows a single amount


def find_invoice(text: str) -> str:
    m = (re.search(r"(?:invoice|order|receipt|account|bill|document)\s*(?:#|no\.?|number|id)\s*:?\s*([A-Z0-9][A-Z0-9-]{3,24})", text, re.I)
         or re.search(r"\binvoice\s+([A-Z0-9-]*\d[A-Z0-9-]{2,24})\b", text, re.I))
    return m.group(1) if m else ""


def vendor_name(display: str, email: str) -> str:
    display = re.sub(r"\(via .*?\)|\b(no-?reply|do-?not-?reply|notifications?|billing|receipts?|team)\b", "", display or "", flags=re.I).strip(" -<>\"")
    if display and "@" not in display:
        return display[:60]
    domain = (email.split("@")[-1] if "@" in email else email).lower()
    parts = [p for p in domain.split(".") if p not in ("com", "net", "org", "io", "co", "us", "email", "mail", "e", "order", "receipt", "account", "online")]
    return (parts[-1] if parts else domain).title()


def vendor_key(email: str) -> str:
    domain = email.lower().split("@")[-1]
    bits = domain.split(".")
    return ".".join(bits[-2:]) if len(bits) >= 2 else domain


def categorize(sender: str, subject: str, learned: dict) -> str:
    _, email = parseaddr(sender)
    key = vendor_key(email)
    if key in learned:
        return learned[key]
    hay = f"{sender} {subject}".lower()
    for cat, pat in RULES:
        if re.search(pat, hay, re.I):
            return cat
    return "Other"


def parse_message(msg: dict, learned: dict) -> Optional[dict]:
    headers = {h["name"].lower(): h["value"] for h in (msg.get("payload") or {}).get("headers") or []}
    subject = headers.get("subject", "")
    sender = headers.get("from", "")
    if SKIP.search(subject):
        return None
    texts, htmls, files = [], [], []
    _walk(msg.get("payload") or {}, texts, htmls, files)
    body = "\n".join(texts) or "\n".join(_strip_html(h) for h in htmls) or msg.get("snippet", "")
    try:
        when = parsedate_to_datetime(headers.get("date")).astimezone(timezone.utc)
    except Exception:
        when = datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, timezone.utc)
    display, email = parseaddr(sender)
    amount = find_amount(f"{subject}\n{body}")
    if amount is None and re.search(r"invoice|receipt", subject, re.I) and not email.lower().endswith(".gov"):
        vals = [float(v.replace(",", "")) for v in re.findall(MONEY, body)]
        vals = [v for v in vals if 0 < v < 100000]
        amount = round(max(vals), 2) if vals else None  # supplier invoices often show the total without a label
    pdfs = [f for f in files if f["mime"] == "application/pdf" or f["name"].lower().endswith(".pdf")]
    if amount is None and not pdfs:
        return None  # nothing that looks like a bill
    if amount is None and not (BILL_WORDS.search(subject) or any(BILL_WORDS.search(f["name"]) for f in pdfs)):
        return None  # a PDF that isn't a bill (contracts, signed documents)
    return {"messageId": msg["id"], "threadId": msg.get("threadId"), "date": when, "vendor": vendor_name(display, email),
            "vendorKey": vendor_key(email), "from": email.lower(), "subject": subject[:200], "amount": amount,
            "invoice": find_invoice(f"{subject}\n{body}"), "category": categorize(sender, subject, learned),
            "attachments": [{"name": f["name"], "attachmentId": f["attachmentId"], "size": f["size"]} for f in pdfs][:5],
            "snippet": html_lib.unescape(msg.get("snippet", ""))[:240]}


# ---------------- Gmail client ----------------
class GmailReceipts:
    def __init__(self, db, client_id: str, client_secret: str, redirect_uri: str, secret: str):
        self.db = db
        self.client_id, self.client_secret, self.redirect_uri = client_id, client_secret, redirect_uri
        self.cipher = Fernet(base64.urlsafe_b64encode(hashlib.sha256(("gmail-receipts:" + secret).encode()).digest()))

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    async def inboxes(self) -> list[dict]:
        return await self.db.gmail_inboxes.find({}, {"_id": 0, "encryptedRefreshToken": 0}).to_list(10)

    async def auth_url(self, mode: str, hint: str = "") -> str:
        if not self.configured:
            raise GmailError("Google sign-in isn't set up on the server yet.")
        state = secrets.token_urlsafe(24)
        await self.db.oauth_states.insert_one({"kind": "gmail", "state": state, "mode": "personal" if mode == "personal" else "business",
                                               "expiresAt": _now() + timedelta(minutes=15)})
        params = {"client_id": self.client_id, "redirect_uri": self.redirect_uri, "response_type": "code", "scope": SCOPES,
                  "access_type": "offline", "prompt": "consent", "state": state, "include_granted_scopes": "true"}
        if hint:
            params["login_hint"] = hint
        return AUTH_URL + "?" + urlencode(params)

    async def _token(self, data: dict) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(TOKEN_URL, data={**data, "client_id": self.client_id, "client_secret": self.client_secret})
        payload = r.json() if r.content else {}
        if r.is_error or not payload.get("access_token"):
            raise GmailError(payload.get("error_description") or payload.get("error") or "Google did not accept the sign-in.")
        return payload

    async def callback(self, code: str, state: str) -> dict:
        row = await self.db.oauth_states.find_one_and_delete({"kind": "gmail", "state": state, "expiresAt": {"$gt": _now()}})
        if not row:
            raise GmailError("The sign-in link expired. Start again from the Business expenses page.")
        tokens = await self._token({"grant_type": "authorization_code", "code": code, "redirect_uri": self.redirect_uri})
        if not tokens.get("refresh_token"):
            raise GmailError("Google didn't return offline access. Remove the app at myaccount.google.com/permissions and connect again.")
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{GMAIL}/profile", headers={"Authorization": f"Bearer {tokens['access_token']}"})
        email = (r.json() if r.content else {}).get("emailAddress", "").lower()
        if not email:
            raise GmailError("Could not read which Gmail account was connected.")
        await self.db.gmail_inboxes.update_one({"email": email}, {"$set": {
            "email": email, "mode": row["mode"], "encryptedRefreshToken": self.cipher.encrypt(tokens["refresh_token"].encode()).decode(),
            "connectedAt": _now(), "lastError": ""}, "$setOnInsert": {"approvedSenders": []}}, upsert=True)
        return {"email": email, "mode": row["mode"]}

    async def disconnect(self, email: str) -> None:
        await self.db.gmail_inboxes.delete_one({"email": email})

    async def _access(self, inbox: dict) -> str:
        full = await self.db.gmail_inboxes.find_one({"email": inbox["email"]})
        refresh = self.cipher.decrypt(full["encryptedRefreshToken"].encode()).decode()
        return (await self._token({"grant_type": "refresh_token", "refresh_token": refresh}))["access_token"]

    async def _get(self, token: str, path: str, params: Optional[dict] = None) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{GMAIL}{path}", params=params, headers={"Authorization": f"Bearer {token}"})
        payload = r.json() if r.content else {}
        if r.is_error:
            raise GmailError(((payload.get("error") or {}).get("message")) or f"Gmail returned {r.status_code}.")
        return payload

    async def sync(self, days: int = 400, limit: int = 300) -> dict:
        learned = {r["vendorKey"]: r["category"] async for r in self.db.expense_vendor_rules.find({"category": {"$in": CATEGORIES}}, {"_id": 0})}
        ignored = {r["vendorKey"] async for r in self.db.expense_vendor_rules.find({"ignore": True}, {"_id": 0, "vendorKey": 1})}
        added, seen = 0, 0
        for inbox in await self.inboxes():
            try:
                token = await self._access(inbox)
                query = f"newer_than:{days}d {QUERY}"
                if inbox.get("mode") == "personal":
                    senders = inbox.get("approvedSenders") or []
                    if not senders:
                        continue
                    query = f"newer_than:{days}d (" + " OR ".join(f"from:{s}" for s in senders) + ")"
                ids, page = [], None
                while len(ids) < limit:
                    params = {"q": query, "maxResults": 100}
                    if page:
                        params["pageToken"] = page
                    res = await self._get(token, "/messages", params)
                    ids += [m["id"] for m in res.get("messages") or []]
                    page = res.get("nextPageToken")
                    if not page:
                        break
                for mid in ids[:limit]:
                    if await self.db.expenses.find_one({"messageId": mid}, {"_id": 1}):
                        seen += 1
                        continue
                    msg = await self._get(token, f"/messages/{mid}", {"format": "full"})
                    row = parse_message(msg, learned)
                    if not row:
                        await self.db.expenses.insert_one({"messageId": mid, "inbox": inbox["email"], "notReceipt": True, "auto": True,
                                                           "date": datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, timezone.utc)})
                        continue
                    if row["vendorKey"] in ignored:
                        row["notReceipt"] = True
                    row.update({"inbox": inbox["email"], "importedAt": _now(), "id": secrets.token_hex(8)})
                    await self.db.expenses.insert_one(row)
                    added += 1
                await self.db.gmail_inboxes.update_one({"email": inbox["email"]}, {"$set": {"lastSyncAt": _now(), "lastError": ""}})
            except Exception as exc:
                await self.db.gmail_inboxes.update_one({"email": inbox["email"]}, {"$set": {"lastError": str(exc)[:300]}})
        return {"added": added, "alreadyHad": seen}

    async def attachment(self, expense_id: str, attachment_id: str) -> tuple[bytes, str]:
        row = await self.db.expenses.find_one({"id": expense_id})
        if not row:
            raise GmailError("Receipt not found.")
        att = next((a for a in row.get("attachments") or [] if a["attachmentId"] == attachment_id), None)
        if not att:
            raise GmailError("Attachment not found.")
        inbox = await self.db.gmail_inboxes.find_one({"email": row["inbox"]}, {"_id": 0, "email": 1})
        if not inbox:
            raise GmailError("That inbox is no longer connected.")
        token = await self._access(inbox)
        data = await self._get(token, f"/messages/{row['messageId']}/attachments/{attachment_id}")
        raw = base64.urlsafe_b64decode(data.get("data", "") + "=" * (-len(data.get("data", "")) % 4))
        return raw, att["name"]


# ---------------- reporting & edits ----------------
def gmail_link(row: dict) -> str:
    return f"https://mail.google.com/mail/?authuser={quote(row.get('inbox', ''))}#all/{row.get('messageId', '')}"


async def report(db, start: str, end: str, category: str = "", q: str = "", show_hidden: bool = False) -> dict:
    s = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
    e = datetime.fromisoformat(end).replace(tzinfo=timezone.utc) + timedelta(days=1)
    flt: dict = {"date": {"$gte": s, "$lt": e}, "notReceipt": {"$ne": True}}
    if show_hidden:
        flt = {"date": {"$gte": s, "$lt": e}, "notReceipt": True, "auto": {"$ne": True}}
    rows = await db.expenses.find(flt, {"_id": 0}).sort("date", -1).to_list(5000)
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in f"{r.get('vendor')} {r.get('subject')} {r.get('invoice')} {r.get('amount')}".lower()]
    all_rows = rows
    if category:
        rows = [r for r in rows if r.get("category") == category]
    by_cat, by_vendor, by_month = {}, {}, {}
    for r in all_rows:
        amt = float(r.get("amount") or 0)
        by_cat[r["category"]] = round(by_cat.get(r["category"], 0) + amt, 2)
    for r in rows:
        amt = float(r.get("amount") or 0)
        by_vendor.setdefault(r["vendor"], {"vendor": r["vendor"], "total": 0.0, "count": 0})
        by_vendor[r["vendor"]]["total"] = round(by_vendor[r["vendor"]]["total"] + amt, 2)
        by_vendor[r["vendor"]]["count"] += 1
        m = r["date"].strftime("%Y-%m") if isinstance(r["date"], datetime) else str(r["date"])[:7]
        by_month[m] = round(by_month.get(m, 0) + amt, 2)
    for r in rows:
        r["date"] = (r["date"] if r["date"].tzinfo else r["date"].replace(tzinfo=timezone.utc)).isoformat().replace("+00:00", "Z")
        r["gmailUrl"] = gmail_link(r)
    return {"from": start, "to": end, "items": rows, "total": round(sum(float(r.get("amount") or 0) for r in rows), 2),
            "missingAmount": sum(1 for r in rows if r.get("amount") is None),
            "categories": [{"name": c, "total": by_cat.get(c, 0)} for c in CATEGORIES if by_cat.get(c)],
            "vendors": sorted(by_vendor.values(), key=lambda x: -x["total"])[:15],
            "months": [{"month": k, "total": v} for k, v in sorted(by_month.items())],
            "allCategories": CATEGORIES}


async def update(db, expense_id: str, changes: dict, remember: bool = True) -> dict:
    row = await db.expenses.find_one({"id": expense_id})
    if not row:
        raise GmailError("Receipt not found.")
    sets = {}
    if "category" in changes and changes["category"] in CATEGORIES:
        sets["category"] = changes["category"]
        if remember and row.get("vendorKey"):
            await db.expense_vendor_rules.update_one({"vendorKey": row["vendorKey"]}, {"$set": {"vendorKey": row["vendorKey"], "category": changes["category"]}}, upsert=True)
            await db.expenses.update_many({"vendorKey": row["vendorKey"], "categoryLocked": {"$ne": True}}, {"$set": {"category": changes["category"]}})
    if "vendor" in changes:
        sets["vendor"] = str(changes["vendor"])[:60]
    if "amount" in changes:
        sets["amount"] = None if changes["amount"] in (None, "") else round(float(changes["amount"]), 2)
    if "notes" in changes:
        sets["notes"] = str(changes["notes"])[:300]
    if "notReceipt" in changes:
        sets["notReceipt"] = bool(changes["notReceipt"])
        if changes.get("ignoreSender") and row.get("vendorKey"):
            await db.expense_vendor_rules.update_one({"vendorKey": row["vendorKey"]}, {"$set": {"vendorKey": row["vendorKey"], "ignore": True}}, upsert=True)
    if sets:
        sets["categoryLocked"] = True if "category" in sets else row.get("categoryLocked", False)
        await db.expenses.update_one({"id": expense_id}, {"$set": sets})
    return {"ok": True}


async def rescan(gmail: "GmailReceipts") -> dict:
    """Forget everything the owner hasn't edited and read Gmail again with the current rules."""
    res = await gmail.db.expenses.delete_many({"categoryLocked": {"$ne": True}, "notes": {"$exists": False},
                                               "$or": [{"notReceipt": {"$ne": True}}, {"auto": True}]})
    out = await gmail.sync()
    out["cleared"] = res.deleted_count
    return out


async def set_senders(db, email: str, senders: list[str]) -> list[str]:
    clean = sorted({s.strip().lower() for s in senders if re.fullmatch(r"[^\s@]*@?[a-z0-9.-]+\.[a-z]{2,}", s.strip().lower())})[:100]
    await db.gmail_inboxes.update_one({"email": email}, {"$set": {"approvedSenders": clean}})
    return clean
