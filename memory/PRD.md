# Puff2Door – PRD

## Original problem statement
Pixel-faithful, Puff2Door-branded clone of nonaonlinesmokeshop.com (WooCommerce smoke/vape shop), white background + emerald accent. Then full-stack: simulated card checkout, live (simulated) order tracker, open product reviews, persistent carts/orders/accounts in MongoDB.

## Architecture
- Frontend: React (CRA) + Tailwind + shadcn, `/app/frontend/src` (mock catalog in `mock.js`, pages in `pages/`, contexts in `context/`, API client `api.js`).
- Backend: FastAPI `/app/backend/server.py`, all routes `/api/*`, MongoDB via `MONGO_URL`/`DB_NAME`.
- Static banner assets: `/app/frontend/public/img/hero-*.jpg`.

## Implemented
- 2026-08: Frontend clone (age gate, header/mega-menu, hero slider, promo tiles, product grids, category tabs, brands, shop/product/cart/auth/static pages).
- 2026-08: Backend – JWT email/password auth, persisted carts, orders, reviews, simulated tracking progression (21/21 backend tests passed). Checkout, `/order/:id`, `/track`, ReviewsSection.
- 2026-09-02: Home page imagery replaced – hero slider now shows 3 AI-generated Puff2Door banners built from real catalog product photos (Geek Bar Pulse 2 Grape Hubba, RAZ Bar 25000 Hawaiian Punch, NEXA Ultra II 50K Georgia Peach Ice) linking to product pages; 4 promo tiles now show real catalog vape products (Foger, RAZ TN9000, Smogger, Muha) with price and link to product pages. All Nona branding removed from home page.

## Known gaps / backlog
- P0: Auth mismatch – user selected Google social login (2-b) but JWT email/password was implemented. Needs user decision.
- P1: User manual validation of checkout/tracking/reviews (agent-tested only).
- P1: `ShopPage` useMemo exhaustive-deps warning.
- P2: Real payments (Stripe) if user wants live charges.
- P2: Admin panel for products/orders.
