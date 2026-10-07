# Puff2Door website

This repository is a self-contained copy of the Puff2Door storefront. It includes the customer website, responsive mobile layout, product catalog, search and filtering, wishlist, cart and checkout, order tracking, customer accounts, rewards, live chat, the admin panel, payment integrations, email hooks, and the 21+ age gate.

The public storefront data was synchronized from `https://puff2door.com` on October 7, 2026. The included initial database contains:

- 98 products
- 17 categories
- 36 brands
- the current homepage banners and promotional sections
- the current public store, delivery, tax, and rewards settings
- local copies of all publicly visible catalog and banner images

## What cannot be copied from public pages

The GitHub export did not include the private production database or secret credentials. Existing customer accounts, passwords, order history, chat history, rewards balances, unpublished inventory changes, payment credentials, and administrator records are therefore not in this copy. The app creates a new database from the included public seed data on its first start.

To retain the existing private records, export the current MongoDB database from the Emergent project and restore it into the new MongoDB database before switching the domain. Never copy secret keys into GitHub.

## Free deployment setup

The included `render.yaml` and `Dockerfile` run the frontend and backend as one service. A practical no-monthly-fee setup is:

1. Create a free MongoDB Atlas M0 database.
2. Push this folder to a private GitHub repository.
3. In Render, create a new Blueprint from the repository. Render will read `render.yaml`.
4. Add the environment variables listed below.
5. After the temporary Render address works, add `puff2door.com` and `www.puff2door.com` under the Render service's custom domains.
6. Replace the domain's DNS records with the values Render displays. Keep the current site connected until the new temporary address has been fully checked.

Render's free web service can sleep after 15 minutes without traffic and may take about a minute to wake. Its local filesystem is temporary, so new admin-uploaded images are stored in MongoDB GridFS. MongoDB Atlas M0 currently includes 512 MB and no automatic backups. This setup can cost $0 per month, but it has free-tier limits and is best for a small early-stage site. The domain renewal and payment processor transaction fees are separate.

## Required environment variables

Copy `backend/.env.example` to `backend/.env` for local development. In Render, enter these values in the service's Environment page:

| Variable | Purpose |
| --- | --- |
| `MONGO_URL` | MongoDB Atlas connection string |
| `DB_NAME` | Use `puff2door` |
| `JWT_SECRET` | A long random secret used to protect login sessions |
| `ADMIN_EMAILS` | Comma-separated owner email addresses |
| `ADMIN_PASSWORD` | Creates the initial administrator on an empty database |
| `SITE_URL` | `https://puff2door.com` |
| `PUBLIC_URL` | `https://puff2door.com` |

The following are optional until those services are enabled:

- `GOOGLE_CLIENT_ID` for Google sign-in. Create a Google OAuth web client and allow both the temporary Render origin and `https://puff2door.com`.
- `RESEND_API_KEY`, `EMAIL_FROM`, and `NOTIFY_EMAIL` for transactional email.
- PayPal, Square, or Zelle variables from `backend/.env.example` for real payments.

When a real Square or PayPal account is configured, keep `ALLOW_TEST_CARD=false`. Without live processor credentials, card checkout cannot collect real money. PayPal, Square, and email providers can charge their own usage or transaction fees even when hosting is free.

## Run locally

Requirements: Python 3.11, Node.js 20, Yarn 1.22, and MongoDB.

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn server:app --reload --port 8000
```

Frontend, in a second terminal:

```bash
cd frontend
corepack enable
yarn install --frozen-lockfile
REACT_APP_BACKEND_URL=http://localhost:8000 yarn start
```

Open `http://localhost:3000`. The first backend start seeds an empty database with the included public catalog and creates the initial administrator when `ADMIN_EMAILS` and `ADMIN_PASSWORD` are present.

## Refresh public storefront data

If the current public site changes before launch, run:

```bash
python3 scripts/sync_public_site.py
```

This updates the public seed files and downloads the latest publicly visible images. It does not access private accounts or administrator data.

## Production build

```bash
cd frontend
yarn build
```

The FastAPI backend serves the generated React build in production. The Docker image performs this build automatically.
