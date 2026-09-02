# Puff2Door — Backend Integration Contracts

## Auth (JWT email/password)
- POST /api/auth/register {email, password, firstName, lastName, address?, state?, city?, zip?, phone?} -> {token, user}
- POST /api/auth/login {email, password} -> {token, user}
- GET /api/auth/me (Bearer) -> user
- user = {id, email, firstName, lastName, address, state, city, zip, phone}
- Password hashed with passlib pbkdf2_sha256. JWT HS256, 7-day expiry, secret from env or default.

## Cart (per-user, requires auth)
- GET /api/cart -> {items:[{productId, name, price, image, category, categorySlug, slug, qty}]}
- PUT /api/cart {items:[...]} -> {items} (full replace)
Frontend: CartContext keeps localStorage cart (guest). On login: fetch server cart; if empty push local, else use server. On change while logged in: debounced PUT.

## Reviews (open to anyone)
- GET /api/reviews/{productSlug} -> {reviews:[{id,name,rating,comment,createdAt}], average, count}
- POST /api/reviews {productSlug, name, rating(1-5), comment} -> review
Frontend: ProductDetail shows average + list + form.

## Orders + Simulated Tracking
- POST /api/orders {items, shipping:{firstName,lastName,email,phone,address,city,state,zip}, subtotal, shippingCost, discount, total, paymentLast4} -> order
- GET /api/orders (auth) -> user's orders (newest first)
- GET /api/orders/track/{orderNumber} -> order (public tracking lookup)
- GET /api/orders/{id} -> order
- order = {id, orderNumber, userId?, items, shipping, subtotal, shippingCost, discount, total, paymentLast4, createdAt, status, timeline}
- Tracking simulated from elapsed time since createdAt (computed on GET):
  placed(0s) -> confirmed(30s) -> out_for_delivery(90s) -> delivered(180s)
  timeline = [{key,label,at,done}] with estimated timestamps.

## Frontend wiring
- src/api.js: axios instance with REACT_APP_BACKEND_URL + Bearer token from localStorage(p2d_token).
- AppContext: real register/login/me/logout using api.
- New pages: Checkout (/checkout), OrderConfirmation+Tracking (/order/:id), Track lookup (/track), Account shows order history.
- ProductDetail: reviews section (dynamic average replaces mock rating).
- Checkout is SIMULATED: validates card format, stores last4 only, no real charge.

## Data notes
- Products remain in frontend mock.js (static). Reviews/orders reference product slug/fields.
