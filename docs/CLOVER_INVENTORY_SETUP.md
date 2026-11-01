# Puff2Door Clover inventory connection

This connection uses Clover's API directly. It does not require Zapier, Make,
or a paid App Market connector. Existing Clover hardware, account, and payment
processing charges are separate.

## Token mode (recommended)

Use a merchant API token from the regular Clover web dashboard. No Clover developer app or OAuth is required. Webhooks are not available in this mode. Stock and prices update from the scheduled pull (about every 12 minutes while the API process is awake) and from **Sync now** / **Preview sync**.

1. Sign in to [clover.com](https://www.clover.com) as the merchant, for example puff2door@gmail.com.
2. Open **Account & Setup > API Tokens** and create a token.
3. Tick these permissions:
   - **Inventory: Read** — required. The sync reads items and item stocks.
   - **Inventory: Write** — required. A placed online order reduces item stock with `PUT /v3/merchants/{mId}/item_stocks/{itemId}`.
   - **Merchant: Read** — required. **Test connection** calls `GET /v3/merchants/{mId}`.
   - **Orders: Read** — not required. This code does not call the Clover orders API. Online orders adjust item stock only.
4. Find `CLOVER_MERCHANT_ID` in the dashboard URL: `https://www.clover.com/home/m/<id>`. That id is 13 letters and numbers. It is not the longer merchant number printed on the Clover device.
5. On the Render `puff2door` API service, set:

   - `CLOVER_API_TOKEN` — the token from step 2. Secret. Never put it in the frontend.
   - `CLOVER_MERCHANT_ID` — the 13-character id from the dashboard URL.
   - `CLOVER_ENV=production` — uses `https://api.clover.com`.
   - `CLOVER_SYNC_ENABLED=false` until a preview looks right.
   - `CLOVER_SYNC_DRY_RUN=false` unless you want enabled sync to report only.

6. Restart the API. Open **Admin → Clover Inventory**. The page says **Connected with API token** and hides **Connect Clover**. Click **Test connection**. It returns the merchant name and an item count only.
7. Click **Preview sync** and review a few items. Nothing is written while `CLOVER_SYNC_ENABLED` is false, or while `CLOVER_SYNC_DRY_RUN=true`.
8. Set `CLOVER_SYNC_ENABLED=true` and restart when the preview is correct.

The token is read from the server environment on each request. It is not stored in MongoDB, not written to logs, and not returned by the admin API.

## What the connection does

- Clover is the source of truth for item stock and prices.
- Automatic pulls stay off until `CLOVER_SYNC_ENABLED=true`. With the flag off,
  **Preview sync** only reports what would change.
- When the flag is on, Puff2Door pulls stock and price about every 12 minutes
  and when Clover sends an inventory webhook. `CLOVER_SYNC_DRY_RUN=true` reports
  the same plan without writing it.
- Online orders reduce the linked Clover stock count once. A retry of the same
  order does not reduce it again. Website edits to names and prices are not
  sent to Clover.
- In token mode the API merchant id is `CLOVER_MERCHANT_ID`. In OAuth mode it
  is the id Clover returns during login. Either way it is the 13-character API
  id, not the longer number printed on the device. The API token itself is
  never saved.
- Existing products match only by a saved Clover item ID or an exact, unique SKU
  or barcode. Product names are never used for automatic matching.
- Private inventory photos link to a Clover item only when the barcode text
  matches exactly, including leading zeros. Photos are not published.
- Unmatched Clover items remain in **Admin → Clover Inventory** for manual review.
- Imports are hidden drafts until the owner reviews product photos, category,
  copy, and compliance settings.

## OAuth app setup (optional)

Use this only if you are not using a merchant API token. Token mode skips this section. Webhook delivery still requires this app.

## One-time Clover setup

1. Sign in to the Clover Developer Dashboard and create a **private app**.
2. Give the app read and write inventory permissions.
3. Set the OAuth redirect URL to:

   `https://puff2door.com/api/clover/oauth/callback`

4. In Render, open the `puff2door` API service and add these secret environment
   values:

   - `CLOVER_CLIENT_ID` — the Clover App ID
   - `CLOVER_CLIENT_SECRET` — the Clover App Secret
   - `CLOVER_WEBHOOK_AUTH_CODE` — the Clover Auth Code used in the
     `X-Clover-Auth` webhook header

5. Keep these non-secret values:

   - `CLOVER_ENV=production`
   - `CLOVER_REDIRECT_URI=https://puff2door.com/api/clover/oauth/callback`

6. After Render restarts, open **Puff2Door Admin → Clover Inventory** and click
   **Connect Clover**. Approve access in Clover.
7. In the Clover app's webhook settings, use:

   `https://api.puff2door.com/api/clover/webhook`

8. Send Clover's verification code. The received code appears in **Admin →
   Clover Inventory** so it can be copied back to Clover's Verification Code
   field. Verify and save the webhook.
9. Click **Sync now**. Review unmatched items. Connect them to an existing
   Puff2Door product or import a hidden draft.

## Safety and recovery

- OAuth access and refresh tokens are encrypted with a key derived from the
  server's existing `JWT_SECRET` before storage in MongoDB.
- The App Secret and webhook auth code remain in Render; they are never returned
  to the browser.
- Clover refresh tokens are replaced in storage after every token refresh.
- Failed stock pushes do not cancel a paid customer order. They are recorded in
  the Clover activity log for an administrator to review and retry with
  **Sync now**.
- A product remains safely saved in Puff2Door if Clover is temporarily offline.
  The Products page marks it **Clover retry needed** and provides a retry button.
- Disconnecting Clover removes authorization tokens but preserves product links
  for a later reconnect.

## Official Clover references

- Private apps: https://docs.clover.com/dev/docs/private-apps
- High-trust OAuth flow: https://docs.clover.com/dev/docs/high-trust-app-auth-flow
- Refresh access tokens: https://docs.clover.com/dev/docs/refresh-access-tokens
- Inventory items: https://docs.clover.com/dev/reference/inventorygetitems
- Update item stock: https://docs.clover.com/dev/reference/inventoryupdateitemstock
- Webhooks: https://docs.clover.com/dev/docs/webhooks

