# LayoffCircle backend

Node.js 22+, Express 5, and MySQL REST API for the `laidoff-web` app. The frontend now uses the API for authentication. Feature screens now use the authenticated frontend server proxy for API reads and writes.

## Start locally

```sh
nvm use
npm ci
cp .env.example .env
```

Start your installed MySQL service, then edit `.env` with its host, port, username, and password. Connect with an administrative MySQL account and create the database and application user:

```sql
CREATE DATABASE laidoff CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'laidoff'@'127.0.0.1' IDENTIFIED BY 'replace-with-your-password';
GRANT ALL PRIVILEGES ON laidoff.* TO 'laidoff'@'127.0.0.1';
```

Set `DB_HOST=127.0.0.1`, `DB_NAME=laidoff`, `DB_USER=laidoff`, and `DB_PASSWORD` to the password you chose. Set `DB_PORT` to your MySQL port (default `3306`). Then:

```sh
npm run db:migrate
npm run dev
```

`npm run dev` uses Nodemon to restart the API when source files or `.env` change. Uploads, queued logs, and test artifacts are excluded from restart watching. `npm start` runs Node directly.

The API listens on `http://127.0.0.1:9090`, with routes under `/api/v1`. `GET /health` checks the process; `GET /ready` checks database connectivity. Production uses `npm start`. Startup fails if the database is unavailable.

### Optional fictional seed data

Set `SEED_PASSWORD` to a password of at least 12 characters, then:

```sh
npm run db:seed
```

The seed adds the frontend's company catalog, fictional members, posts, and referral opportunities. It can be rerun without duplicating seed records. It does not fabricate reaction counts, workforce reports, or messages. Login with `jamie.morgan@example.test` and your chosen seed password. The script refuses to run in production. It does not reset existing account passwords.

## Included

- Email/password registration/login, Firebase Google sign-in with explicit linking, expiring sessions, logout, and profile updates.
- Company autocomplete catalog and people search.
- Feed search, topic/company filters, Following, referrals, bookmarks, hidden posts, and sorting.
- Anonymous posts, photos, mutually exclusive likes/dislikes, comments, reposts, bookmarks, and hiding/restoring posts.
- Following and connection requests with recipient-only acceptance.
- Referral creation, opening/closing listings, duplicate-safe requests, and owner-only request decisions.
- Private one-to-one conversation creation, message history, sending, unread counts, and read receipts.
- User-scoped notifications and marking them read.
- Community note proposals and post reports. Notes start pending; only approved notes or the caller's own proposals are visible.
- Workforce report submission, source URLs, yearly company/monthly aggregates, and explicit unverified-data labels.

See [API.md](API.md) for endpoints, request examples, and frontend mapping.

## Database and security

All tables use InnoDB with foreign keys and appropriate uniqueness constraints. User-controlled query values use MySQL2 parameters; pagination and resource IDs are validated. Passwords use salted scrypt hashes. Sessions use random bearer tokens; only SHA-256 token hashes are stored in MySQL. Tokens expire after `SESSION_DAYS` and are revoked on logout, retaining their lifecycle history.

Auth and API requests are rate limited. CORS defaults to the local Next.js app; configure exact allowed origins with `CORS_ORIGINS`. Requests need an `Authorization: Bearer <token>` header. Keep tokens in memory or a server-managed session integration when connecting the frontend; the API does not use browser cookies. Use HTTPS when deployed. Configure `TRUST_PROXY=true` only behind a trusted, single-hop reverse proxy. Rate limits are process-local; multiple API instances need a shared limiter store.

Image uploads accept one `photo` file up to 5 MB. Sharp decodes, limits pixels, strips metadata, resizes, and re-encodes images as WebP; GIFs become a static image. Uploaded image URLs are publicly readable because feed posts are public. Post creation verifies that the image belongs to its author. SVG and arbitrary files are rejected. The uploads folder needs persistent storage in deployment. Unattached uploads are retained; add a retention job for production storage management.

Source links are stored, never fetched by this server. There are no public APIs to approve notes or verify workforce reports: those require a future authenticated moderation workflow. Reports remain pending and workforce submissions remain user-reported. Messaging is REST-based; a connected frontend can poll for new messages. Native email verification, password recovery, realtime sockets, and administrative moderation are not implemented. Google identity emails are verified by Firebase. See [AUTHENTICATION.md](AUTHENTICATION.md) for setup, security details, and frontend session handling.

The schema uses descriptive storage columns (for example, `full_name`, `post_content`, `job_title`, and `first_participant_user_id`), domain lifecycle fields, file metadata, and explicit relationships. See [SCHEMA.md](SCHEMA.md) for the complete table/column/index dictionary and [LOGGING.md](LOGGING.md) for the database logging architecture. Existing API field aliases remain compatible.

Request/response, application/error, SQL execution, and mutation audit logs are stored in four dedicated MySQL tables. A durable local outbox retries database failures. Passwords/tokens are redacted; SQL parameter values and binary data are excluded. See `.env.example` for log payload limits and outbox configuration.

Migrations are applied in filename order, tracked by checksum, and protected by a database advisory lock. MySQL DDL auto-commits: if a migration fails halfway through, repair the partial schema before rerunning. Never edit an applied migration; add a new one. Create the database before migration. This initial schema targets MySQL 8.4 and also passes the local MySQL 5.7 integration tests.

## Tests

```sh
npm test
npm run format:check
```

Integration tests require a separate migrated database whose name ends in `_test`. They create fictional users and remove their records afterward. Never point them at production.

```sh
DB_NAME=laidoff_test npm run db:migrate
DB_NAME=laidoff_test NODE_ENV=test npm run test:integration
```

Use the same host, port, and credentials as your test database. The tests cover authentication/logout, SQL-input validation, CORS, anonymous identity, cross-user ownership boundaries, reaction replacement, bookmarks, hiding/restoring, connection acceptance, referrals, private chats, notifications, and image uploads. Test uploads remain under `UPLOAD_DIR`; use a temporary folder for integration runs.

## Structure

- `src/routes/`: feature APIs and request validation.
- `src/queries/`: named SQL statements and guarded query builders, organized by feature. Routes, authentication, logging, and scripts import SQL from these files; values remain bound parameters.
- `src/auth.js`, `src/security.js`: session authentication and password/token handling.
- `src/db.js`: database pool and transactions.
- `src/app.js`: HTTP middleware, routing, and structured errors.
- `migrations/`: versioned MySQL schema.
- `scripts/`: migrations and optional fictional seed.
- `test/`: unit/HTTP tests and MySQL integration tests.

The `.env` file, uploads, and dependencies are ignored by Git. Do not commit database passwords or session tokens.
