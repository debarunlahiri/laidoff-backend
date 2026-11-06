# Email/password and Google authentication

The web app now has `/login` and `/register` pages, protected app navigation, session restoration, and sign-out. Email/password uses the Node.js API's scrypt password hashes and expiring sessions. Google uses Firebase Authentication to prove identity, then exchanges that proof for the same backend session type. PostgreSQL remains the application user/profile database.

## Local setup

1. Run backend migrations, including `004_google_authentication.sql`.
2. Start the backend with `npm run dev` after configuring its PostgreSQL `.env`.
3. Copy the frontend `.env.example` to `.env.local`. Set `BACKEND_API_URL` to the backend API base, normally `http://127.0.0.1:9090/api/v1`.
4. Start the frontend with `npm run dev` and open `/register`.

Email/password registration needs a name, email, and password of 12–128 characters. The form confirms passwords before submission. Duplicate registration, incorrect credentials, unavailable backend, and expired sessions have error handling. Google is disabled until its client configuration is present. It is not required for email/password authentication.

## Enable Google afterward

In your Firebase project:

1. Register a web app and copy its public configuration into the frontend `.env.local`:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=your-web-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-web-app-id
```

2. Enable the Google provider under Authentication → Sign-in method, and configure the support email.
3. Add the development and production domains under Authentication → Settings → Authorized domains, including `localhost` when testing locally. Use the hostname that matches the URL you browse.
4. Set `FIREBASE_PROJECT_ID` in the backend `.env` to the same project ID.
5. Provide Firebase Admin credentials through Application Default Credentials. For local development, point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account JSON file stored outside either repository. Never put Admin credentials or a private key in `NEXT_PUBLIC_*` variables.
6. Restart the backend and restart/rebuild the frontend after changing environment values.

The backend verifies the Firebase ID token with revocation checking and accepts only a verified Google identity. It does not trust email/name sent directly by the browser. The Google identity is stored in `authentication_identities`, separately from the user/profile and application session. Google-only users have a null local password hash and cannot use an invented email/password combination to sign in.

The production token verifier is implemented in [Firebase authentication service](src/services/firebase-authentication.js). The injectable verifier used by integration tests is a code dependency, not an HTTP flag or environment bypass.

## Existing accounts and linking

A Google email that already belongs to a password account is not automatically merged. Sign in with the password first, then choose **Link Google account** from the account menu. The backend requires the verified Google email to match the authenticated account and rejects identities attached to someone else. Once linked, either method returns the same PostgreSQL user. Existing profile names and email addresses are not silently overwritten by provider profile changes.

Logout revokes the current application session. It does not sign out other devices. Firebase's temporary browser sign-in uses in-memory persistence and is cleared after obtaining the ID token. API sessions have their own lifetime; later Firebase revocation does not retroactively revoke a previously exchanged backend session. Suspend the backend account or revoke its sessions when blocking application access.

## Browser session handling

The Next.js server mediates authentication through `/api/auth/*` and stores the opaque backend session token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production). Backend session tokens are not returned to client-side JavaScript or stored in localStorage. Mutating auth requests require a matching Origin. Configure optional `AUTH_APP_ORIGIN` in the frontend for a canonical public origin behind a reverse proxy.

The browser receives the user/profile only. `/api/auth/session` restores it through the backend `/auth/me`. The protected layout redirects signed-out users to login and returns them to an allowed app route after authentication. Network failures preserve the cookie and offer retry rather than treating a temporary server failure as a logout.

The frontend now connects feed, referrals, network actions, messaging, notifications, company search, and workforce insights through its authenticated server proxy. Authenticated names now replace the hardcoded account/composer/referral-author identity.

## Backend endpoints

- `POST /api/v1/auth/register`: `{name,email,password}`.
- `POST /api/v1/auth/login`: `{email,password}`.
- `POST /api/v1/auth/verify-email`: `{token}` from the emailed link; marks the email verified (400 if invalid/expired).
- `POST /api/v1/auth/resend-verification`: authenticated; emails a fresh link (60 s cooldown, 429 if too soon).
- `POST /api/v1/auth/google`: `{idToken}`; creates or restores a Google-linked user and returns `{token,expiresAt,user}`.
- `POST /api/v1/auth/google/link`: authenticated, `{idToken}`; links a matching verified Google identity.
- `GET /api/v1/auth/providers`: authenticated; lists linked providers.
- `GET /api/v1/auth/me`: authenticated profile.
- `POST /api/v1/auth/logout`: revoke current session.

SQL remains in separate files under `src/queries`. API, database, application, and audit logging cover authentication. Passwords, ID tokens, bearer tokens, and cookies are redacted. Actual Google sign-in requires the Firebase setup above and is not confirmed by mocked integration tests.

References: [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin), [Admin token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [Admin setup](https://firebase.google.com/docs/admin/setup).

## Email verification, reminders and welcome email

Emails go out through SMTP (Hostinger: `smtp.hostinger.com`, port 465, SSL) using `nodemailer`. Set `SMTP_USER`, `SMTP_PASSWORD` and `APP_URL` (the public frontend URL) in `.env`; with SMTP unset, emails are skipped and logged instead of failing requests. Then run `npm run db:migrate` (adds `002_email_verification.sql`).

- **Registration** sends a verification email (link `APP_URL/verify-email?token=...`, valid `EMAIL_VERIFICATION_HOURS`, default 24; only the SHA-256 hash is stored) and a welcome email listing what members can do. Sending is in the background, so a mail outage never fails sign-up. Login is not blocked for unverified users.
- **Reminders**: every 15 minutes the API emails unverified password accounts a fresh link: first after `VERIFICATION_REMINDER_AFTER_HOURS` (24), then every `VERIFICATION_REMINDER_INTERVAL_HOURS` (72), at most `VERIFICATION_REMINDER_MAX` (3). Reserved `.test` / `example.*` addresses are skipped. Set `VERIFICATION_REMINDERS_ENABLED=false` to turn off.
- **In-app prompt**: `/auth/me`, login and register responses include `emailVerified`, so the frontend can show a "verify your email" banner with a resend button.
- **Google sign-up** is already verified; new Google members get only the welcome email.
- The frontend needs a `/verify-email` page that reads `token` from the URL and POSTs it to `/auth/verify-email`.

## Admin (email management)

Administrators manage the email system at `/admin` in the web app: edit the three email templates (with live preview, test send and restore-default), tune reminder/sending settings, read the delivery log, and edit members (verified flag, status, admin flag, name, reminder count) or resend their emails. Template and setting changes apply to the next email without a restart; environment values are only the defaults.

- Make an account an admin: `npm run admin:make -- you@example.com` (add `--remove` to revoke). Run `npm run db:migrate` first (`003_admin_email.sql`).
- The admin API lives under `/api/v1/admin/*`. It needs a valid session **and** an active admin account. Anyone else, including normal members, receives the same `404 Route not found` as for any unknown URL, so its existence is not revealed. It has its own rate limit and is not documented in `API.md`.
- The web app only shows the Admin link to admins and renders the normal 404 page to everyone else, but authorisation is enforced by the backend, never by the UI.
- You can't remove your own admin access or suspend yourself from the panel.

## Verification gate and caching

- **Gate:** members with an unverified email (Google accounts and admins are exempt) get **read-only** access for `verificationGraceHours` (default 24) after sign-up. Any change (POST/PUT/PATCH/DELETE) is refused with `403` and `code: "EMAIL_NOT_VERIFIED"`. Once the window passes, every API call except the verification endpoints (`/auth/me`, `/auth/logout`, `/auth/verify-email`, `/auth/resend-verification`) is refused with `code: "EMAIL_VERIFICATION_REQUIRED"`, and the web app shows only the verification screen. Admins can change both values, or switch the gate off, in Admin → Settings. The gate runs on the server, so it can't be bypassed from the browser.
- `/auth/me`, login and register responses include `emailVerified`, `verificationRequired`, `emailVerificationDeadline` and `verificationExpired`.
- Existing unverified accounts older than the window are locked out until they verify (use Admin → Users to mark someone verified, or switch the gate off).
- **Caching:** `GET /insights/*` (60 s), `/posts/topic-options` and `/daily-reminder` (5 min) are cached in memory because they are identical for every member; the insights cache is cleared when a workforce report is added. The web app also keeps a per-session stale-while-revalidate cache of every list and page it loads (`lib/cache.ts`), so revisiting a screen shows data instantly and refreshes it quietly. It is cleared when the signed-in member changes, and entries are dropped when related data is modified.
