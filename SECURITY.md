# Puff2door security checklist

## Required production settings

- Set `JWT_SECRET` to a unique random value of at least 32 bytes. Never reuse an admin password or payment secret.
- Set a strong `ADMIN_PASSWORD` only for the initial admin account. Changing this variable does not overwrite an existing admin password.
- Keep `ALLOW_TEST_CARD=false` and `ALLOW_PASSWORD_RESET_TOKEN_RESPONSE=false` in production.
- Set `SITE_URL` and `PUBLIC_URL` to `https://puff2door.com` and allow only the production site in `CORS_ORIGINS`.
- Keep PayPal, Google, email, and database secrets in Render environment variables. Do not put them in Git or frontend variables.
- Use HTTPS for every production page and callback URL.

## Operational controls

- Give admin accounts unique passwords and remove access immediately when staff leave.
- Review the admin compliance alerts, failed ID checks, payment failures, and support queue daily.
- Back up the database and test a restore regularly.
- Rotate payment, email, Google, database, and JWT secrets if one is exposed.
- Keep dependencies current and repeat the backend and frontend vulnerability audits before major releases.

## Customer and order data

- Do not collect or retain complete ID images in this application.
- Export customer or compliance data only for a valid business need and store exports securely.
- Order pages must require the customer account or the signed order link sent to that customer.
- Password-reset links expire after one hour and must never be exposed in a production API response.

## Reporting a security issue

Do not post customer data, credentials, or exploit details in a public issue. Contact the site owner privately and rotate any exposed secret before investigating further.
