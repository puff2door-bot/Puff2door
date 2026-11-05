# Agent 12 Instagram publisher

## Current implementation

Agent 12 can generate one 1080×1080 PNG and one compliant caption per day. It
rotates across seven visual themes and fourteen business-safe topics; consecutive
days cannot reuse the same theme or topic.

The connector uses Meta's Facebook Login for Business with a system-user token.
OAuth state is single-use and expires after 15 minutes. Meta access tokens are
encrypted before storage and never returned by an API response or written to an
audit log.

Publishing is protected by three gates:

1. Meta must return the exact username `hdsmokeshop.altamonte`.
2. An administrator must publish and verify one test post.
3. An administrator must type the exact username and enable the daily schedule.

The normal schedule is 9:00 AM America/New_York. A GitHub Actions wake-up call
runs at both possible UTC equivalents and the API enforces local time plus one
post per calendar day, so daylight-saving changes cannot create a duplicate.

## Meta resources already created

- Meta app: `HD Agent 12 Social Publisher`
- App ID: `1145283828055613`
- Login configuration: `HD Instagram Publisher`
- Configuration ID: `4461075690813851`
- Business portfolio ID: `1931265227835163`
- Graph API version: `v27.0`
- Expected Instagram account: `@hdsmokeshop.altamonte`

No Instagram account token has been issued, no test post has been published,
and daily publishing is off.

## Server-only Render settings

Set these in Render's secret environment settings. Never commit their values.

```text
INSTAGRAM_APP_ID=1145283828055613
INSTAGRAM_APP_SECRET=<enter directly in Render>
INSTAGRAM_CONFIG_ID=4461075690813851
INSTAGRAM_BUSINESS_ID=1931265227835163
INSTAGRAM_GRAPH_VERSION=v27.0
INSTAGRAM_REDIRECT_URI=https://puff2door.com/api/instagram/oauth/callback
INSTAGRAM_EXPECTED_USERNAME=hdsmokeshop.altamonte
INSTAGRAM_TOKEN_ENCRYPTION_KEY=<unique random value, at least 32 characters>
AGENT12_CRON_SECRET=<different unique random value, at least 32 characters>
```

Add the same `AGENT12_CRON_SECRET` value as a GitHub Actions repository secret.

## Remaining one-time setup

1. Deploy the reviewed branch.
2. Add the exact OAuth redirect URI to Facebook Login for Business settings.
3. Enter the three server-only secrets directly in Render.
4. Open Admin → Agents and choose **Connect Instagram**.
5. During Meta consent, select only `@hdsmokeshop.altamonte`.
6. Generate a demo, approve one neutral test post, and verify its permalink.
7. Type the exact username to enable daily 9:00 AM publishing.

TikTok is not implemented or connected. It remains a planned integration.

## Compliance limits

The free MVP uses locally rendered brand graphics instead of a paid generative
image API. Captions prohibit discounts, urgency, health claims, and product-level
promotion. Each post includes adults-only and ID language. The connector has no
advertising, messaging, comment-management, or deletion permission.
