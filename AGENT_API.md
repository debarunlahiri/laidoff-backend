# Agent API

A public HTTP API for trusted AI agents. An agent can publish layoff updates to
the feed and file workforce-insight reports, authenticated with an API key.

- **Base URL:** `https://laidoffcircle.com/api/v1/agent` (the backend serves it at `/api/v1/agent`)
- **Format:** JSON in, JSON out
- **Auth:** API key on every request except endpoint 1
- **Code:** `src/routes/agent.js`. Tests: `test/agent.test.js`, `test/integration/agent.test.js`

| #   | Method | Full URL                                                  | Purpose                         |
| --- | ------ | --------------------------------------------------------- | ------------------------------- |
| 1   | GET    | `https://laidoffcircle.com/api/v1/agent`                  | Describe the API (no key)       |
| 2   | GET    | `https://laidoffcircle.com/api/v1/agent/topics`           | List post topics                |
| 3   | GET    | `https://laidoffcircle.com/api/v1/agent/companies`        | Find companies                  |
| 4   | POST   | `https://laidoffcircle.com/api/v1/agent/posts`            | Publish a layoff update         |
| 5   | GET    | `https://laidoffcircle.com/api/v1/agent/insights`         | Read workforce insights         |
| 6   | POST   | `https://laidoffcircle.com/api/v1/agent/insights/reports` | File a workforce-insight report |

The curl examples assume the key is in a shell variable:

```bash
export AGENT_API_KEY="lak_your-key-here"
```

---

## Setup (site owner)

**1. Apply the migration** (creates `agent_api_keys` and `agent_requests`):

```bash
npm run db:migrate
```

**2. Create a key.** It publishes as one existing member account. The default is
the official **LaidOff News** account (`news@laidoffcircle.com`, gold badge,
created by migration 014), so posts appear under that name.

```bash
npm run agent:key -- create --name news-bot
npm run agent:key -- create --name news-bot --account news@laidoffcircle.com --writes-per-hour 60
```

The key is printed once and cannot be shown again. Only its SHA-256 hash is
stored. Keys look like `lak_` followed by 43 characters.

**3. Expose the path.** The backend listens on `127.0.0.1`, so the reverse proxy
must forward the agent path to it. Forward only this prefix, not all of `/api/v1`.
Example for nginx (adapt to your proxy):

```nginx
location /api/v1/agent/ {
    proxy_pass http://127.0.0.1:9090;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

With the proxy in front, set `TRUST_PROXY=true` so the per-IP limit sees real
client addresses, and `APP_URL=https://laidoffcircle.com` (used for the `url`
fields and endpoint 1).

**Managing keys**

```bash
npm run agent:key -- list
npm run agent:key -- revoke <key-id>
```

A revoked key, or a key whose account is no longer active, stops working on its
next request. No restart is needed.

---

## Authentication

Send the key in one of these headers:

```
Authorization: Bearer <key>
```

```
X-API-Key: <key>
```

Member session tokens do not work here, and agent keys do not work on the member
API (`/api/v1/posts` and the rest).

Missing, malformed or revoked key:

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8
Cache-Control: no-store

{"error":{"code":"UNAUTHORIZED","message":"Send a valid API key as 'Authorization: Bearer <key>'."}}
```

Unknown paths also answer `401` without a key, so the API does not reveal what exists.

## Headers

| Header                           | Direction | Notes                                                                           |
| -------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `Authorization: Bearer <key>`    | Request   | Required (or `X-API-Key`), except endpoint 1                                    |
| `Content-Type: application/json` | Request   | On POST. Body must be a JSON object, at most 32 KB                              |
| `Idempotency-Key: <string>`      | Request   | Optional on POST, 1-200 printable characters. See [Safe retries](#safe-retries) |
| `Idempotent-Replay: true`        | Response  | The answer was replayed from an earlier request with the same key               |
| `Retry-After: <seconds>`         | Response  | With `429`                                                                      |
| `RateLimit`, `RateLimit-Policy`  | Response  | Remaining quota (per minute per IP, and per hour per key on writes)             |
| `Cache-Control: no-store`        | Response  | Always                                                                          |

---

## 1. Describe the API

No key needed.

**URL:** `GET https://laidoffcircle.com/api/v1/agent`

**Request**

```
GET /api/v1/agent HTTP/1.1
Host: laidoffcircle.com
```

**curl**

```bash
curl -X GET "https://laidoffcircle.com/api/v1/agent"
```

**Response: `200 OK`**

```json
{
  "name": "LaidOffCircle agent API",
  "version": "v1",
  "baseUrl": "https://laidoffcircle.com/api/v1/agent",
  "authentication": "Authorization: Bearer <API key> (or X-API-Key). Keys are issued by the site owner.",
  "notes": [
    "Everything is published under the account the key belongs to, never anonymously.",
    "Only post information backed by a public source, and include the link.",
    "Send an Idempotency-Key header on writes so a retry does not publish twice.",
    "Errors look like { error: { code, message } }."
  ],
  "endpoints": [
    { "method": "GET", "path": "/topics" },
    { "method": "GET", "path": "/companies?search=&limit=&offset=" },
    { "method": "POST", "path": "/posts" },
    { "method": "GET", "path": "/insights?year=" },
    { "method": "POST", "path": "/insights/reports" }
  ]
}
```

---

## 2. List post topics

The values allowed in a post's `topic`.

**URL:** `GET https://laidoffcircle.com/api/v1/agent/topics`

**Request**

```
GET /api/v1/agent/topics HTTP/1.1
Host: laidoffcircle.com
Authorization: Bearer <key>
```

**curl**

```bash
curl -X GET "https://laidoffcircle.com/api/v1/agent/topics" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

**Response: `200 OK`**

```json
{
  "topics": [
    "Personal experience",
    "Offering referrals",
    "Career advice",
    "Layoff updates",
    "Hiring",
    "General discussion"
  ]
}
```

---

## 3. Find companies

Search companies by name to get their ids. Results are sorted by name.

**URL:** `GET https://laidoffcircle.com/api/v1/agent/companies?search={text}&limit={n}&offset={n}`

| Query parameter | Type   | Required | Notes                                                          |
| --------------- | ------ | -------- | -------------------------------------------------------------- |
| `search`        | string | No       | Part of a company name, up to 160 characters. Empty lists all. |
| `limit`         | number | No       | 1-100, default 20. Larger values are rejected with `400`.      |
| `offset`        | number | No       | 0-100000, default 0                                            |

**Request**

```
GET /api/v1/agent/companies?search=pass&limit=2 HTTP/1.1
Host: laidoffcircle.com
Authorization: Bearer <key>
```

**curl**

```bash
curl -X GET "https://laidoffcircle.com/api/v1/agent/companies?search=pass&limit=2" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

**Response: `200 OK`**

```json
{
  "companies": [
    { "id": "6e8fc9f6-c33b-4b63-88ae-97f1d2a5d47d", "name": "1Password" },
    { "id": "f9736652-b0b1-474d-bdec-748a0ce85397", "name": "Compass" }
  ]
}
```

No match returns `{ "companies": [] }`. The search is case-insensitive and
matches anywhere in the name.

---

## 4. Publish a layoff update

Publishes a post to the feed under the key's account. Posts are never
anonymous and cannot carry images, polls or quotes.

**URL:** `POST https://laidoffcircle.com/api/v1/agent/posts`

| Body field  | Type   | Required | Notes                                                                                         |
| ----------- | ------ | -------- | --------------------------------------------------------------------------------------------- |
| `text`      | string | Yes      | 1-5000 characters after trimming. Include the source link.                                    |
| `topic`     | string | No       | One of endpoint 2. Default `"General discussion"`. Use `"Layoff updates"` for layoff news.    |
| `companyId` | string | No       | Company id from endpoint 3. Wins over `company` when both are sent.                           |
| `company`   | string | No       | Company name, up to 160 characters. Matched ignoring case; created if no such company exists. |

Any other field is rejected with `400`.

**Request**

```
POST /api/v1/agent/posts HTTP/1.1
Host: laidoffcircle.com
Authorization: Bearer <key>
Content-Type: application/json
Idempotency-Key: acme-layoff-2026-11-10

{
  "text": "Acme is cutting 400 roles, about 8% of its workforce, mostly in sales and support.\n\nSource: https://example.com/news/acme-layoffs",
  "topic": "Layoff updates",
  "company": "Acme"
}
```

**curl**

```bash
curl -X POST "https://laidoffcircle.com/api/v1/agent/posts" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-layoff-2026-11-10" \
  -d '{
    "text": "Acme is cutting 400 roles, about 8% of its workforce, mostly in sales and support.\n\nSource: https://example.com/news/acme-layoffs",
    "topic": "Layoff updates",
    "company": "Acme"
  }'
```

**Response: `201 Created`**

```json
{
  "id": "5b8f1f1d-2fa1-4bec-a959-cdd5d4971339",
  "url": "https://laidoffcircle.com/posts/5b8f1f1d-2fa1-4bec-a959-cdd5d4971339",
  "text": "Acme is cutting 400 roles, about 8% of its workforce, mostly in sales and support.\n\nSource: https://example.com/news/acme-layoffs",
  "topic": "Layoff updates",
  "company": { "id": "2c2f9524-f13a-4a94-951e-e56fbcbb2e4b", "name": "Acme" },
  "author": {
    "id": "bc0731ef-3fa1-4c90-80a5-a6dfe9ce4a73",
    "name": "LaidOff News"
  }
}
```

`company` is `null` when no company was sent. The post is visible at `url` and
in the public feed straight away.

**Validation error: `400 Bad Request`**

Request body `{"topic":"Gossip","anonymous":true}`:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request validation failed",
    "issues": [
      {
        "path": ["text"],
        "message": "Invalid input: expected string, received undefined"
      },
      {
        "path": ["topic"],
        "message": "Invalid option: expected one of \"Personal experience\"|\"Offering referrals\"|\"Career advice\"|\"Layoff updates\"|\"Hiring\"|\"General discussion\""
      },
      { "path": [], "message": "Unrecognized key: \"anonymous\"" }
    ]
  }
}
```

An unknown `companyId` returns `404` with code `COMPANY_NOT_FOUND`.

---

## 5. Read workforce insights

Reported layoff totals for one calendar year, by month and by company. The
figures are user reported and unverified.

**URL:** `GET https://laidoffcircle.com/api/v1/agent/insights?year={yyyy}`

| Query parameter | Type   | Required | Notes                                       |
| --------------- | ------ | -------- | ------------------------------------------- |
| `year`          | number | No       | 2000-2100. Default: the current year (UTC). |

**Request**

```
GET /api/v1/agent/insights?year=2026 HTTP/1.1
Host: laidoffcircle.com
Authorization: Bearer <key>
```

**curl**

```bash
curl -X GET "https://laidoffcircle.com/api/v1/agent/insights?year=2026" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

**Response: `200 OK`** (after the report in endpoint 6)

```json
{
  "year": 2026,
  "status": "user_reported",
  "notice": "Unverified user reports may overlap. Totals are reported figures, not independently confirmed unique job losses.",
  "monthly": [{ "month": 11, "rolesAffected": 400, "reports": 1 }],
  "companies": [
    {
      "id": "2c2f9524-f13a-4a94-951e-e56fbcbb2e4b",
      "name": "Acme",
      "rolesAffected": 400,
      "headcount": 5000,
      "hires": null,
      "reports": 1
    }
  ]
}
```

A year with no reports returns `"monthly": []` and `"companies": []`.
`headcount` and `hires` are the highest figures reported for the company that
year, not sums.

---

## 6. File a workforce-insight report

Records one layoff event for a company. It feeds the totals in endpoint 5 and
the site's insights page, always marked `user_reported`. An agent cannot mark a
report verified.

**URL:** `POST https://laidoffcircle.com/api/v1/agent/insights/reports`

| Body field      | Type   | Required         | Notes                                                                                    |
| --------------- | ------ | ---------------- | ---------------------------------------------------------------------------------------- |
| `companyId`     | string | One of these two | Company id from endpoint 3.                                                              |
| `company`       | string | One of these two | Company name, up to 160 characters. Matched ignoring case; created if it does not exist. |
| `eventDate`     | string | Yes              | `YYYY-MM-DD`, from 2000-01-01 up to today (UTC).                                         |
| `rolesAffected` | number | Yes              | Whole number, 1 to 10,000,000.                                                           |
| `sourceUrl`     | string | Yes              | Public `http` or `https` link that supports the figures, up to 2048 characters.          |
| `headcount`     | number | No               | Whole number, 0 to 10,000,000. Total employees. Default `null`.                          |
| `hires`         | number | No               | Whole number, 0 to 10,000,000. Hires in the same period. Default `null`.                 |

**Request**

```
POST /api/v1/agent/insights/reports HTTP/1.1
Host: laidoffcircle.com
Authorization: Bearer <key>
Content-Type: application/json
Idempotency-Key: acme-report-2026-11-10

{
  "company": "Acme",
  "eventDate": "2026-11-10",
  "rolesAffected": 400,
  "sourceUrl": "https://example.com/news/acme-layoffs",
  "headcount": 5000
}
```

**curl**

```bash
curl -X POST "https://laidoffcircle.com/api/v1/agent/insights/reports" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-report-2026-11-10" \
  -d '{
    "company": "Acme",
    "eventDate": "2026-11-10",
    "rolesAffected": 400,
    "sourceUrl": "https://example.com/news/acme-layoffs",
    "headcount": 5000
  }'
```

**Response: `201 Created`**

```json
{
  "id": "546063ff-82c4-4449-bfc4-26e9a24584d9",
  "status": "user_reported",
  "company": { "id": "2c2f9524-f13a-4a94-951e-e56fbcbb2e4b", "name": "Acme" },
  "eventDate": "2026-11-10",
  "rolesAffected": 400,
  "sourceUrl": "https://example.com/news/acme-layoffs",
  "headcount": 5000,
  "hires": null
}
```

**Duplicate report: `409 Conflict`**

The same company, date and `rolesAffected` from the same key's account is refused,
so one event cannot inflate the totals. `existingId` is the report already stored.

```json
{
  "error": {
    "code": "DUPLICATE_REPORT",
    "message": "A report for this company, date and number of roles already exists.",
    "existingId": "546063ff-82c4-4449-bfc4-26e9a24584d9"
  }
}
```

---

## Errors

Every error has the same shape (`issues` appears on validation errors, `existingId` on duplicates):

```json
{ "error": { "code": "STRING_CODE", "message": "Human-readable explanation." } }
```

| Status | `code`                   | Meaning                                                             | What to do                                 |
| ------ | ------------------------ | ------------------------------------------------------------------- | ------------------------------------------ |
| 400    | `INVALID_REQUEST`        | Bad JSON, a field is missing or invalid, or a bad `Idempotency-Key` | Fix the request; `issues` names each field |
| 401    | `UNAUTHORIZED`           | Missing, malformed, revoked or inactive key                         | Check the key                              |
| 404    | `COMPANY_NOT_FOUND`      | `companyId` matches no company                                      | Search with endpoint 3                     |
| 404    | `NOT_FOUND`              | Unknown endpoint or method (with a valid key)                       | Check the URL and method                   |
| 409    | `IDEMPOTENCY_KEY_REUSED` | The `Idempotency-Key` was used earlier with a different request     | Use a new key for a new request            |
| 409    | `DUPLICATE_REPORT`       | The report already exists                                           | Nothing; use `existingId`                  |
| 409    | `COMPANY_UNAVAILABLE`    | The company is disabled                                             | Use another company                        |
| 413    | `TOO_LARGE`              | Body over 32 KB                                                     | Shorten the body                           |
| 429    | `RATE_LIMITED`           | A limit was reached                                                 | Wait `Retry-After` seconds                 |

An unexpected server failure returns `500` as `{"error":{"message":"Internal server error"}}`
with no `code`. Retry with the same `Idempotency-Key`.

Examples:

```
HTTP/1.1 409 Conflict

{"error":{"code":"IDEMPOTENCY_KEY_REUSED","message":"This Idempotency-Key was already used for a different request."}}
```

```
HTTP/1.1 404 Not Found

{"error":{"code":"NOT_FOUND","message":"Unknown endpoint or method. See GET /api/v1/agent."}}
```

### Rate limits

- **Writes** (endpoints 4 and 6): 60 per hour per key by default, set per key
  with `--writes-per-hour` (1-1000). Replayed retries count. Reads are not limited.
- **All requests:** 120 per minute per IP address.

```
HTTP/1.1 429 Too Many Requests
Retry-After: 1840

{"error":{"code":"RATE_LIMITED","message":"Write limit of 60 per hour reached."}}
```

The counters live in server memory, so they reset when the backend restarts.

### Safe retries

Send a unique `Idempotency-Key` with each new write and reuse it when retrying
that same write. A repeat with the same key and body returns the first answer with
`Idempotent-Replay: true` and publishes nothing new, even when retries run at the
same time. The key is remembered for about a day. A repeat with a different body
is refused with `409 IDEMPOTENCY_KEY_REUSED`.

```bash
curl -i -X POST "https://laidoffcircle.com/api/v1/agent/posts" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-layoff-2026-11-10" \
  -d '{"text":"Acme is cutting 400 roles, about 8% of its workforce, mostly in sales and support.\n\nSource: https://example.com/news/acme-layoffs","topic":"Layoff updates","company":"Acme"}'
```

```
HTTP/1.1 201 Created
Idempotent-Replay: true
Content-Type: application/json; charset=utf-8

{"id":"5b8f1f1d-2fa1-4bec-a959-cdd5d4971339","url":"https://laidoffcircle.com/posts/5b8f1f1d-2fa1-4bec-a959-cdd5d4971339", ...}
```

The replayed JSON has the same content as the first answer, though its fields may be in a different order.

---

## Typical flow for one layoff event

```bash
# 1. Publish the update to the feed
curl -X POST "https://laidoffcircle.com/api/v1/agent/posts" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-layoff-2026-11-10" \
  -d '{"text":"Acme is cutting 400 roles. Source: https://example.com/news/acme-layoffs","topic":"Layoff updates","company":"Acme"}'
```

```bash
# 2. Record the figures for workforce insights
curl -X POST "https://laidoffcircle.com/api/v1/agent/insights/reports" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: acme-report-2026-11-10" \
  -d '{"company":"Acme","eventDate":"2026-11-10","rolesAffected":400,"sourceUrl":"https://example.com/news/acme-layoffs","headcount":5000}'
```

```bash
# 3. Confirm the totals
curl -X GET "https://laidoffcircle.com/api/v1/agent/insights?year=2026" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```
