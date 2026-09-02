# Puff2Door – PRD

## Original problem statement
Pixel-faithful, Puff2Door-branded clone of nonaonlinesmokeshop.com (WooCommerce smoke/vape shop), white background + emerald accent. Then full-stack: simulated card checkout, live (simulated) order tracker, open product reviews, persistent carts/orders/accounts in MongoDB. Later: Google login, deal of the day, shop filters, wishlist + restock alerts, password-auth hardening, and a full admin panel (products w/ photos + price + inventory, orders).

## Architecture
- Frontend: React (CRA) + Tailwind + shadcn, `/app/frontend/src`. Contexts: `AppContext` (auth), `CartContext`, `WishlistContext`, `CatalogContext` (products from API, deal-of-day, pricing). Static site content (categories, brands, hero/promo, BRAND contact info) in `mock.js`.
- Backend: FastAPI `/app/backend/server.py`, all routes `/api/*`, MongoDB (`MONGO_URL`/`DB_NAME`). Collections: users, user_sessions (Google), carts, wishlists, orders, reviews, products, stock_alerts, password_reset_tokens, login_attempts, files.
- Product catalog seeded from `/app/backend/seed_products.json` on first start (67 products). Images: external URLs or uploaded to Emergent Object Storage, served via `GET /api/files/{path}`.
- Auth: JWT email/password (pbkdf2) + Emergent Google Auth (session_token in `user_sessions`, cookie or Bearer). Admin = `role: admin` or email in `ADMIN_EMAILS` env.
- Env (backend/.env): MONGO_URL, DB_NAME, JWT_SECRET, EMERGENT_LLM_KEY (object storage), ADMIN_EMAILS, ADMIN_PASSWORD.

## Implemented
- 2026-08: Frontend clone; backend JWT auth, carts, orders, reviews, simulated tracking; checkout, /order/:id, /track.
- 2026-09-02: Home imagery → real catalog vapes (AI hero banners + promo tiles linking to products).
- 2026-09-02: Google login (Emergent Auth) alongside email/password; wishlist hearts + /wishlist + restock "Notify me" alerts; Deal of the Day countdown banner (20% off, resets midnight); shop filters (brand / flavor / puff count); sold-out products.
- 2026-09-02: Password auth hardening: strength rules + meter + show/hide, remember-me (30d vs 1d JWT), forgot/reset password (token shown in-app – no email provider), brute-force lockout (5 fails → 15 min, per email).
- 2026-09-02: Catalog moved to MongoDB with real inventory: orders reserve stock atomically, 409 when insufficient, server-side price recomputation (client totals ignored). Admin panel `/admin`: dashboard stats, products CRUD (drag-drop upload or URL, sale price, stock, hide), orders with manual status override (drives customer tracker), restock alerts list (restock 0→N marks alerts notified – EMAIL MOCKED/logged only). 404 page. Footer/header contact → (530) 665-0850 / puff2door@gmail.com.
- 2026-09-02: Payments layer – checkout payment picker with Square card, Cash App Pay (via Square), PayPal, Zelle and Test Card; providers env-driven (SQUARE_APPLICATION_ID/ACCESS_TOKEN/LOCATION_ID/ENV, PAYPAL_CLIENT_ID/CLIENT_SECRET/ENV, ZELLE_EMAIL/NAME) with graceful "not configured" state; Zelle = manual pay (order awaiting_payment, instructions with memo=order#, admin "Mark Paid" → confirmed); server-authoritative pricing, atomic stock reserve/release on payment failure; PayPal order created & captured server-side with amount check. Square/PayPal paths covered by mocked unit tests (tests/test_payments_mock.py) – REAL KEYS NOT YET PROVIDED.
- 2026-09-02: Admin "Home Banners" CMS (/admin/banners): hero slides + promo tiles editable (site_content collection, GET /api/content/home, PUT /api/admin/content/home), seeded from seed_content.json. puff2door@gmail.com added to ADMIN_EMAILS.
- 2026-09-02: Transactional emails via Resend (`backend/emails.py`, env RESEND_API_KEY / EMAIL_FROM / NOTIFY_EMAIL / PUBLIC_URL): order confirmation (with Zelle box when unpaid), payment received (Mark Paid), status updates (confirmed / out for delivery / delivered), password reset (link emailed; falls back to in-app link if send fails), restock alerts, new-order notification to puff2door@gmail.com. Non-blocking (asyncio task), every send logged to `email_log`, viewable at /admin/emails. Test addresses (@example.com) are skipped. CURRENTLY IN RESEND TEST MODE: sender onboarding@resend.dev → only delivers to puff2door@gmail.com until domain verified.
- Testing: iteration_3 (74/74) and iteration_4 (94/94 backend, all frontend flows) passed; emails verified live to owner inbox.

## Known gaps / backlog
- P0: Square (Application ID, Access Token, Location ID – sandbox first) and PayPal (Client ID, Secret) credentials from owner → paste into backend/.env and restart; then verify real card / Cash App / PayPal flows in browser (frontend components SquarePayment.jsx / PayPalCheckout.jsx untested against live SDKs).
- P1: Verify puff2door.com at resend.com/domains, then set EMAIL_FROM="Puff2Door <orders@puff2door.com>" in backend/.env and restart so customers receive emails.
- P1: Deal-of-day floor allows 20% off any disposable at order time (lenient server floor); tighten if abused.
- P2: Product slug not regenerated on rename; promo/hero tiles are static in mock.js (not admin-editable).
- P2: Split server.py into routers.
