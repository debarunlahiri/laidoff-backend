# API guide

Base URL: `http://127.0.0.1:9090/api/v1`. All feature endpoints require `Authorization: Bearer <token>`. Registration and login do not. Bodies are JSON except image uploads. Successful lists are JSON arrays. IDs are UUID strings. Datetimes are stored in UTC; MySQL DATETIME/TIMESTAMP strings represent UTC. Clients should parse them as UTC before displaying local time.

Lists use `limit` (default 20, maximum 100) and `offset` (default 0). Messages are paginated newest-first at the database and returned in chronological order within each page. Prepend older pages when loading chat history. Error format:

```json
{
  "error": {
    "message": "Validation failed",
    "issues": [{ "path": ["email"], "message": "Invalid email address" }]
  }
}
```

Common statuses: 400 validation, 401 missing/expired session, 403 forbidden, 404 absent/inaccessible, 409 duplicate/conflict, 413 oversized body/upload, 429 rate limit.

## Authentication and profiles

| Method | Path             | Body / purpose                                                                                                                                 |
| ------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register` | `{ "name": "Jamie Morgan", "email": "jamie@example.com", "password": "at-least-12-characters" }`                                               |
| POST   | `/auth/login`    | `{ "email": "jamie@example.com", "password": "at-least-12-characters" }`                                                                       |
| POST   | `/auth/logout`   | Revoke current token, returns 204                                                                                                              |
| GET    | `/auth/me`       | Current private profile including email                                                                                                        |
| PATCH  | `/me`            | Any of `name`, `role`, `about`, `skills` (string array), `nextChapter`, `openToWork` (boolean), `location`, `websiteUrl`, `linkedinProfileUrl` |
| GET    | `/users`         | `search`, pagination; excludes caller; includes following state                                                                                |
| GET    | `/users/:id`     | Public profile, never email or password hash                                                                                                   |
| GET    | `/companies`     | `search`, pagination; returns `{id,name}` entries                                                                                              |

Register/login return `{token, expiresAt, user}`. Passwords are 12–128 characters. Logout invalidates the current session only, retaining its revocation timestamp. Company selection must save the company's `id`, not arbitrary typed text. The initial catalog comes from the optional seed; no public company-creation API is exposed.

## Google sign-in

- `POST /auth/google`: `{idToken}` verified with Firebase Admin; returns the same session shape as password login.
- `POST /auth/google/link`: authenticated `{idToken}`; requires the same verified email as the signed-in account.
- `GET /auth/providers`: authenticated list of linked providers.

Google email collisions require explicit linking after password sign-in. Configure Firebase as described in [AUTHENTICATION.md](AUTHENTICATION.md). The frontend auth pages are now connected through a Next.js server proxy with an HttpOnly session cookie; the feature hooks now use the authenticated backend proxy.

## Feed

| Method       | Path                  | Body / purpose                                                                                  |
| ------------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| GET          | `/posts`              | `search`, `topic`, `companyId`, `tab`, `sort`, pagination                                       |
| POST         | `/posts`              | `text`, optional `topic`, `companyId`, `anonymous`, `uploadId`                                  |
| DELETE       | `/posts/:id`          | Author only                                                                                     |
| PUT          | `/posts/:id/reaction` | `{ "reaction": "like" }` or `dislike`; replaces previous reaction                               |
| DELETE       | `/posts/:id/reaction` | Clear caller's reaction                                                                         |
| PUT / DELETE | `/posts/:id/bookmark` | Set/remove bookmark                                                                             |
| PUT / DELETE | `/posts/:id/repost`   | Set/remove repost                                                                               |
| PUT / DELETE | `/posts/:id/hide`     | Hide/restore for the caller                                                                     |
| DELETE       | `/posts/hidden/all`   | Restore all caller's hidden posts                                                               |
| GET / POST   | `/posts/:id/comments` | GET paginated; POST `{ "text": "A comment" }`                                                   |
| GET / POST   | `/posts/:id/notes`    | GET approved/own notes; POST `{ "text": "Context", "sourceUrl": "https://example.com/source" }` |
| POST         | `/posts/:id/reports`  | `{ "reason": "Reason for review" }`; one report per user/post                                   |

`tab`: `all`, `following`, `referrals`, `bookmarks`, `hidden`. `sort`: `latest`, `most-liked`. Topics: Personal experience, Offering referrals, Career advice, Layoff updates, Hiring, General discussion. Hidden posts are omitted except under `tab=hidden`.

Post list items include text/topic/company, author name/role, `authorId`, `createdAt`, image path, counts (`likes`, `dislikes`, `comments`, `reposts`), caller `reaction`, `saved`, `reposted`, `own`, and `openToWork`. Anonymous posts expose a null `authorId` and anonymous display identity. API UUIDs replace the prototype's numeric post IDs.

Uploading a photo is a separate authenticated request:

```sh
curl -X POST http://127.0.0.1:9090/api/v1/uploads \
  -H "Authorization: Bearer $TOKEN" \
  -F photo=@./photo.jpg
```

Response: `{ "id": "upload-uuid", "url": "/uploads/upload-uuid.webp" }`. Pass that `id` as `uploadId` to post creation. Prefix returned image paths with the API origin. A post currently supports one image, matching the frontend's single-photo state.

## Network

| Method       | Path                | Body / purpose                                                         |
| ------------ | ------------------- | ---------------------------------------------------------------------- |
| PUT / DELETE | `/users/:id/follow` | Follow/unfollow; idempotent                                            |
| GET          | `/connections`      | Caller's incoming/outgoing pending and accepted connections, paginated |
| POST         | `/connections`      | `{ "userId": "other-user-uuid" }`; one unordered pair per two users    |
| PATCH        | `/connections/:id`  | `{ "status": "accepted" }`; recipient only                             |
| DELETE       | `/connections/:id`  | Decline, cancel, or disconnect; either participant                     |

## Referrals

| Method | Path                              | Body / purpose                                                     |
| ------ | --------------------------------- | ------------------------------------------------------------------ |
| GET    | `/referrals`                      | `search`, `companyId`, `status=open                                | closed | all`, pagination |
| POST   | `/referrals`                      | `companyId`, `title`, `location`, `skills`, optional `description` |
| PATCH  | `/referrals/:id`                  | `{ "status": "closed" }` or `open`; owner only                     |
| POST   | `/referrals/:id/requests`         | Request once; cannot request own or closed listing                 |
| GET    | `/referrals/:id/requests`         | Requester names/statuses; listing owner only, paginated            |
| PATCH  | `/referrals/:id/requests/:userId` | `{ "status": "accepted" }` or `declined`; listing owner only       |

Lists include `own` and caller's `requestStatus`. Requests belong to an opportunity ID, so separate roles at one company have independent requests. Creating a referral does not create a generic feed post. No résumé or private contact information is transmitted with a request.

## Messaging and notifications

| Method | Path                          | Body / purpose                                                                  |
| ------ | ----------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/conversations`              | Inbox with partner, preview, lastMessageAt, unread count; paginated             |
| POST   | `/conversations`              | `{ "userId": "other-user-uuid" }`; returns an existing or new pair conversation |
| GET    | `/conversations/:id/messages` | Participant-only paginated history                                              |
| POST   | `/conversations/:id/messages` | `{ "text": "Hello!" }`; participant only                                        |
| PUT    | `/conversations/:id/read`     | Mark incoming messages read                                                     |
| GET    | `/notifications`              | Caller-only notifications, paginated                                            |
| PUT    | `/notifications/read`         | Mark all read                                                                   |
| PUT    | `/notifications/:id/read`     | Mark one owned notification read                                                |

Message responses include `senderId`, `createdAt`, and, for history, `readAt`. Use senderId to determine outgoing bubbles. Poll the inbox/current conversation from the frontend with a cleanup/abort strategy; realtime delivery is not included. Sending a message creates the recipient's notification in the same transaction.

## Workforce insights

| Method | Path                | Body / purpose                                                                                       |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/insights`         | `year`, returns monthly totals and company aggregates                                                |
| GET    | `/insights/reports` | Paginated source reports                                                                             |
| POST   | `/insights/reports` | `companyId`, `eventDate` (`YYYY-MM-DD`), `rolesAffected`, `sourceUrl`, optional `headcount`, `hires` |

User submissions are always `user_reported`. Clients cannot set verified status. Aggregates may include overlapping reports and are explicitly unverified. Headcount and hires use the maximum reported figure per company/year, not summed snapshots. No artificial reports are seeded.

## Connecting the frontend

Configure a frontend API origin such as `NEXT_PUBLIC_API_URL=http://localhost:9090/api/v1`, add an authentication flow, then replace each demo hook's local actions with the matching API calls. Fetch profile/session after login, pass bearer tokens, and refetch or optimistically reconcile mutations. Keep filters as query parameters; invalidate related feed/referral/inbox/notification queries after updates. Handle 401 by returning to sign-in and validation errors inline.

Authentication screens and session handling are connected in `laidoff-web`; feature hooks also connect through the authenticated proxy. The API uses normalized company/user UUIDs and UTC timestamps, so map those into the existing UI types when connecting it. Reaction counts and request status come from the server, not local arrays.

Implementation references: [Express 5 error handling](https://expressjs.com/en/5x/guide/error-handling/) and [MySQL2 prepared statements](https://sidorares.github.io/node-mysql2/docs/documentation/prepared-statements).

## Request tracing

Every response includes `X-Request-Id`. Use it to correlate database API, SQL, application, and audit logs. Database storage now uses descriptive column names; the response/request field names documented here remain compatible. See [LOGGING.md](LOGGING.md) and [SCHEMA.md](SCHEMA.md) for full details.

## Frontend integration support

- `GET /companies/:id`: resolve the selected company in autocomplete.
- `GET /network/stats`: connection/following and incoming/outgoing request totals.
- `GET /posts/topics`: topic counts for conversation discovery.
- `GET /notifications/summary`: unread notification and private-message totals.

Feed responses also include caller following state and the latest approved community note/source. Anonymous authors do not expose following state. The frontend uses UUIDs for mutations and server-provided counts; authentication stays in its HttpOnly cookie.
