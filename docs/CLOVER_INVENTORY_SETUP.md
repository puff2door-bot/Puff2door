# Puff2Door Clover inventory connection

This connection uses Clover's API directly. It does not require Zapier, Make,
or a paid App Market connector. Existing Clover hardware, account, and payment
processing charges are separate.

## What the connection does

- Clover is the source of truth for stock quantities.
- Puff2Door pulls stock when the owner clicks **Sync now** and when Clover sends
  an inventory webhook.
- Puff2Door sends the new quantity to Clover after website sales, cancellations,
  and approved restocks.
- Products created in Puff2Door are created in Clover when the connection is
  active. Later name, price, SKU, barcode, visibility, and stock changes are
  sent to the linked Clover item.
- Existing products match only by a saved Clover item ID or an exact, unique SKU
  or barcode. Product names are never used for automatic matching.
- Unmatched Clover items remain in **Admin → Clover Inventory** for manual review.
- Imports are hidden drafts until the owner reviews product photos, category,
  copy, and compliance settings.

## One-time Clover setup

1. Sign in to the Clover Developer Dashboard and create a **private app**.
2. Give the app read and write inventory permissions.
3. Set the OAuth redirect URL to:

   `https://api.puff2door.com/api/clover/oauth/callback`

4. In Render, open the `puff2door` API service and add these secret environment
   values:

   - `CLOVER_CLIENT_ID` — the Clover App ID
   - `CLOVER_CLIENT_SECRET` — the Clover App Secret
   - `CLOVER_WEBHOOK_AUTH_CODE` — the Clover Auth Code used in the
     `X-Clover-Auth` webhook header

5. Keep these non-secret values:

   - `CLOVER_ENV=production`
   - `CLOVER_REDIRECT_URI=https://api.puff2door.com/api/clover/oauth/callback`

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

