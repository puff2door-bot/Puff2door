# Auth-Gated App Testing Playbook (Emergent Google Auth)

Puff2Door specifics: users collection uses `id` (uuid string) as the custom id field, sessions live in `user_sessions` with `userId` + `session_token` + `expires_at`. Backend accepts the session token either as `session_token` httpOnly cookie or `Authorization: Bearer <token>` header (JWT tokens from email/password login also work in the same header).

## Step 1: Create Test User & Session
```
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({ id: userId, email: 'test.user.' + Date.now() + '@example.com', firstName: 'Test', lastName: 'User', picture: '', provider: 'google', createdAt: new Date() });
db.user_sessions.insertOne({ userId: userId, session_token: sessionToken, expires_at: new Date(Date.now() + 7*24*60*60*1000), createdAt: new Date() });
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```
(Replace `test_database` with DB_NAME from /app/backend/.env.)

## Step 2: Test Backend API
```
curl -X GET "$API/api/auth/me" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
curl -X GET "$API/api/wishlist" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
curl -X PUT "$API/api/wishlist" -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_SESSION_TOKEN" -d '{"items":[{"productId":14,"slug":"x","notify":false}]}'
curl -X POST "$API/api/auth/logout" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Step 3: Browser Testing
Set `localStorage.p2d_token = YOUR_SESSION_TOKEN` (frontend sends it as Bearer) or add cookie:
```
await page.context.add_cookies([{ "name": "session_token", "value": "YOUR_SESSION_TOKEN", "domain": "<preview-host>", "path": "/", "httpOnly": true, "secure": True, "sameSite": "None" }])
```
Then open `/my-account` – should show the account view (greeting + orders), not the login form.

## Google login button
`/my-account` → "Continue with Google" (data-testid `google-login-btn`) redirects to `https://auth.emergentagent.com/?redirect=<origin>/my-account`. The real Google flow cannot be automated; test the callback by visiting `/my-account#session_id=<fake>` and expect a "Google sign-in failed" toast and redirect back to `/my-account`.

## Clean test data
```
mongosh --eval "use('test_database'); db.users.deleteMany({email: /test\.user\./}); db.user_sessions.deleteMany({session_token: /test_session/});"
```
