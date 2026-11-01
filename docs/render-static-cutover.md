# Puff2Door Render static storefront cutover

This change removes Render's cold-start loading page from customer-facing page loads without adding a monthly hosting fee. The React storefront runs as a Render Static Site and the existing FastAPI service remains the API.

## Required order

1. Create the `puff2door-storefront` static site from `render.yaml` and confirm its build succeeds.
2. Add `api.puff2door.com` as a custom domain on the existing `puff2door` web service.
3. Add the DNS record Render supplies for `api.puff2door.com` and wait for Render's certificate to become active.
4. Confirm `https://api.puff2door.com/api/` returns `{"message":"Puff2Door API"}`.
5. Confirm the static site's `REACT_APP_BACKEND_URL` is `https://api.puff2door.com`, then rebuild it.
6. Test products, account login, Google login, cart, checkout, tracking, admin, chat, and push subscription on the static site's temporary `onrender.com` address.
7. Remove `puff2door.com` from the existing web service and add it to `puff2door-storefront`.
8. Confirm both `https://puff2door.com` and `https://www.puff2door.com` load the static storefront.

Do not move the main domain before the API subdomain and static preview tests pass. This order keeps the current site available throughout the change.

## Expected behavior

- Public pages and cached assets load immediately from Render's CDN.
- When the free API is asleep, the Puff2Door page stays visible and shows a small in-site message while secure services wake.
- Product data, account, checkout, tracking, admin, chat, and payments become available as soon as the API responds.
- Authentication cookies remain first-party because the storefront and API use subdomains of `puff2door.com`.
