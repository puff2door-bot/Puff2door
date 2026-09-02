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
- Testing: iteration_3 – backend 74/74 pytest, all frontend flows passed.

## Known gaps / backlog
- P0: Owner's Gmail must be added to `ADMIN_EMAILS` (backend/.env) so their Google login gets admin. Currently only admin@puff2door.com.
- P1: No email provider → password reset link and restock alerts are shown/logged only (integrate Resend/SendGrid).
- P1: Deal-of-day floor allows 20% off any disposable at order time (lenient server floor); tighten if abused.
- P2: Real payments (Stripe) – checkout is simulated.
- P2: Product slug not regenerated on rename; promo/hero tiles are static in mock.js (not admin-editable).
- P2: Split server.py into routers.
