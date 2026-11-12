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

Google sign-in also stores the account photo as `profileImageUrl` (https, Google-hosted URLs only). It is returned on `/auth/me`, user, connection, conversation and comment payloads, and on non-anonymous posts; anonymous posts always return `null`. Google email collisions require explicit linking after password sign-in. Configure Firebase as described in [AUTHENTICATION.md](AUTHENTICATION.md). The frontend auth pages are now connected through a Next.js server proxy with an HttpOnly session cookie; the feature hooks now use the authenticated backend proxy.

## Feed

| Method       | Path                                      | Body / purpose                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET          | `/posts`                                  | `search`, `topic`, `companyId`, `tab`, `sort`, pagination                                                                                                                                                                         |
| POST         | `/posts`                                  | `text`, optional `topic`, `companyId`, `anonymous`, `uploadId`                                                                                                                                                                    |
| DELETE       | `/posts/:id`                              | Author only                                                                                                                                                                                                                       |
| PUT          | `/posts/:id/reaction`                     | `{ "reaction": "like" }` or `dislike`; replaces previous reaction                                                                                                                                                                 |
| DELETE       | `/posts/:id/reaction`                     | Clear caller's reaction                                                                                                                                                                                                           |
| PUT / DELETE | `/posts/:id/bookmark`                     | Set/remove bookmark                                                                                                                                                                                                               |
| PUT / DELETE | `/posts/:id/repost`                       | Set/remove repost                                                                                                                                                                                                                 |
| PUT / DELETE | `/posts/:id/hide`                         | Hide/restore for the caller                                                                                                                                                                                                       |
| DELETE       | `/posts/hidden/all`                       | Restore all caller's hidden posts                                                                                                                                                                                                 |
| GET / POST   | `/posts/:id/comments`                     | GET paginated top-level comments, each with `replies[]`, `likes`, `dislikes`, `myReaction`; POST `{ "text": "A comment", "parentId?": "<comment id>" }`. Threads are two levels deep: replying to a reply attaches to its parent. |
| PUT / DELETE | `/posts/:id/comments/:commentId/reaction` | PUT `{ "reaction": "like" \| "dislike" }`; DELETE removes it                                                                                                                                                                      |
| GET / POST   | `/posts/:id/notes`                        | GET approved/own notes; POST `{ "text": "Context", "sourceUrl": "https://example.com/source" }`                                                                                                                                   |
| POST         | `/posts/:id/reports`                      | `{ "category": "spam", "reason": "optional details" }`; one report per user/post; cannot report your own post                                                                                                                     |

`tab`: `all`, `following`, `referrals`, `bookmarks`, `hidden`. `sort`: `latest`, `most-liked`. Topics: Personal experience, Offering referrals, Career advice, Layoff updates, Hiring, General discussion. Hidden posts are omitted except under `tab=hidden`.

Post list items include text/topic/company, `images` (up to 6 ordered upload paths; `image` is the first), author name/role, `authorId`, `createdAt`, image path, counts (`likes`, `dislikes`, `comments`, `reposts`), caller `reaction`, `saved`, `reposted`, `own`, and `openToWork`. Anonymous posts expose a null `authorId` and anonymous display identity. API UUIDs replace the prototype's numeric post IDs.

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

| Method | Path                              | Body / purpose                                                                                                                                                                                                       |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/referrals`                      | Filters: `search`, `companyId`, `authorId`, `status=open                                                                                                                                                             | closed                                                                          | all`, `view=all | available | mine   | requested`, `workMode=remote | hybrid | onsite`, `level=entry | mid | senior | lead`, `location`, `skill`, `experience`(your years: roles asking for that many or fewer),`postedWithin=1 | 7   | 30  | 90`(days),`topRated=true`(referrer at least 70% helpful over 3+ votes),`requestStatus`. `sort=newest | oldest | helpful | requests | company`. Personal views need sign-in. Each row has `helpfulCount`, `notHelpfulCount`, `myFeedback`, `authorVotes`, `authorHelpful`, `requestCount`. |
| POST   | `/referrals`                      | `companyId`, `title`, `location`, `workMode`, `level`, `minExperience` (years), `skills` (comma separated), optional `description`, optional `requestFields` (up to 8 of `{label,type,required,options}`, type `text | textarea                                                                        | url             | number    | select | file`)                       |
| PATCH  | `/referrals/:id`                  | `{ "status": "closed" }` or `open`; owner only                                                                                                                                                                       |
| DELETE | `/referrals/:id`                  | Owner only                                                                                                                                                                                                           |
| POST   | `/referrals/documents`            | multipart `document` (PDF, DOC or DOCX, 5 MB). Stored privately, returns `{id,name,size}`                                                                                                                            |
| GET    | `/referrals/documents/:docId`     | Download. Only the uploader or the referrer it was sent to                                                                                                                                                           |
| POST   | `/referrals/:id/requests`         | `{ message?, answers: {fieldId: value}, documents: {fieldId: documentId} }` matching the listing's `requestFields` (500 char message). Once only, not for your own or a closed listing                               |
| DELETE | `/referrals/:id/requests`         | Withdraw your pending request                                                                                                                                                                                        |
| PUT    | `/referrals/:id/feedback`         | `{ "helpful": true                                                                                                                                                                                                   | false }`. Only people who requested it, never the owner. Returns updated totals |
| DELETE | `/referrals/:id/feedback`         | Remove your vote                                                                                                                                                                                                     |
| GET    | `/referrals/:id/requests`         | Requester names, notes and statuses. Listing owner only                                                                                                                                                              |
| PATCH  | `/referrals/:id/requests/:userId` | `{ "status": "accepted" }` or `declined`. Listing owner only                                                                                                                                                         |

Lists include `own` and caller's `requestStatus`. Requests belong to an opportunity ID, so separate roles at one company have independent requests. Creating a referral does not create a generic feed post. No résumé or private contact information is transmitted with a request.

## Messaging and notifications

| Method | Path                          | Body / purpose                                                                                |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/conversations`              | Inbox with partner, preview, lastMessageAt, lastSenderId, lastReadAt, unread count; paginated |
| POST   | `/conversations`              | `{ "userId": "other-user-uuid" }`; returns an existing or new pair conversation               |
| GET    | `/conversations/:id/messages` | Participant-only paginated history                                                            |
| POST   | `/conversations/:id/messages` | `{ "text": "Hello!" }`; participant only                                                      |
| PUT    | `/conversations/:id/read`     | Mark incoming messages read                                                                   |
| GET    | `/notifications`              | Caller-only notifications, paginated                                                          |
| PUT    | `/notifications/read`         | Mark all read                                                                                 |
| PUT    | `/notifications/:id/read`     | Mark one owned notification read                                                              |

Message responses include `senderId`, `createdAt`, and, for history, `readAt`. Use senderId to determine outgoing bubbles. Poll the inbox/current conversation from the frontend with a cleanup/abort strategy; realtime delivery is not included. Sending a message creates the recipient's notification in the same transaction.

## Workforce insights

| Method | Path                | Body / purpose                                                                                       |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/insights`         | `year`, returns monthly totals and company aggregates                                                |
| GET    | `/insights/reports` | Paginated source reports                                                                             |
| POST   | `/insights/reports` | `companyId`, `eventDate` (`YYYY-MM-DD`), `rolesAffected`, `sourceUrl`, optional `headcount`, `hires` |

User submissions are always `user_reported`. Clients cannot set verified status. Aggregates may include overlapping reports and are explicitly unverified. Headcount and hires use the maximum reported figure per company/year, not summed snapshots. No artificial reports are seeded.

## Agent API

AI agents publish layoff updates and file workforce reports through a separate, API-key authenticated API under `/api/v1/agent` (not session tokens). Keys are created with `npm run agent:key`. See [AGENT_API.md](AGENT_API.md) for every endpoint, request, response and curl command.

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
- `GET /search?q=&type=&perGroup=` (public, rate limited): global search. `type` is `all` (default; up to `perGroup`, max 10, per group, for autocomplete), or one of `users`, `posts`, `referrals`, `companies`, `topics` (paginated with `limit`/`offset`). Returns `{users, posts, referrals, companies, topics}`; terms shorter than 2 characters return empty groups. Anonymous posts never match the author's name.
- `GET /users/:id/stats` (public): `{posts, likesReceived, dislikesReceived, commentsReceived, referrals, openReferrals, followers, following, connections}`. Anonymous posts are excluded. `GET /posts` and `GET /referrals` also accept `authorId` (anonymous posts are never returned for it).
- `GET /posts/report-categories`: `[{value,label}]` allowed report categories.
- `GET /posts/topic-options`: the allowed post topics (public), so clients do not hard-code them.
- `GET /daily-reminder` (public): `{id, quote, supportingText}`, one active row per UTC day from `daily_reminders`; 204 when none are active.
- `GET /notifications/summary`: unread notification and private-message totals.

Feed responses also include caller following state and the latest approved community note/source. Anonymous authors do not expose following state. The frontend uses UUIDs for mutations and server-provided counts; authentication stays in its HttpOnly cookie.

## Real-time (WebSocket)

`POST /api/v1/ws-ticket` (authenticated) returns `{ "ticket", "expiresIn": 30 }`. Open `ws://<api-host>/ws?ticket=<ticket>` within 30 seconds; tickets are single use and the `Origin` header must be listed in `CORS_ORIGINS`.

Server events (JSON): `ready`, `message.new {conversationId, senderId}`, `message.read {conversationId, readerId}`, `notification`, `typing {conversationId, userId, typing}`. Clients send `{ "type": "typing", "conversationId", "typing": true|false }`. Events are hints to reload: clients fetch data through the normal REST endpoints. Connections are tracked in memory, so run a single API process or add a shared pub/sub (for example Redis) to scale out.

## Posts with photos

`POST /posts` accepts `{ text?, uploadIds?: string[] (max 6), uploadId? }`. Text may be empty when at least one owned upload is attached. Upload each photo first with `POST /uploads`, then pass the returned ids in display order.

### Message attachments

`POST /api/v1/conversations/:id/messages` also accepts `multipart/form-data` with an optional `text` field and up to 3 `files` (5 MB each; images, PDF, Word/Excel/PowerPoint, TXT, CSV; checked by file signature). A message needs text or at least one file. Responses and `GET /conversations/:id/messages` include `attachments: [{ id, name, mime, size }]`.

`GET /api/v1/conversations/:id/attachments/:attachmentId` streams the file to either participant (images inline, everything else as a download; add `?download=1` to force a download).

### Profile activity lists

- `GET /api/v1/users/:id/followers` and `GET /api/v1/users/:id/connections` return `[{ id, name, role, profileImageUrl, openToWork, since }]`. Sign-in required.
- `GET /api/v1/users/:id/reactions?type=like|dislike` returns who reacted to the member's public posts: `[{ id, name, role, profileImageUrl, postId, postPreview, reactedAt }]`. Only the member themselves (`:id` equals the caller) can call it; anyone else gets 403.

### Polls

`POST /api/v1/posts` accepts an optional `poll: { options: string[2..6], allowMultiple?: boolean, durationHours?: number | null }`. The post `text` is the question and is required. Options must be different; `durationHours` null means the poll never closes.

Feed and search posts include `poll: null` or `{ options: [{ id, text, votes }], totalVotes, voters, allowMultiple, closesAt, closed, myVotes: [optionId] }`.

- `PUT /api/v1/posts/:id/poll/vote` with `{ optionIds: string[] }` votes or changes your vote while the poll is open (one option for single-choice polls). Returns the updated `poll`. 409 once the poll has closed.
- `DELETE /api/v1/posts/:id/poll/vote` removes your vote and returns the updated `poll`.
- `GET /api/v1/posts/:id` returns one post in the feed shape (including `shares`), even if you hid it. Public read.
- `PUT /api/v1/posts/:id/share` records that you shared the post (once per member) and returns `{ shares }`.
- `GET /api/v1/posts/:id/engagement?type=likes|dislikes|comments|shares|reposts` lists the people behind each count: `{ id, name, role, profileImageUrl, at, count }` (`count` is the number of comments, for `type=comments`). Paginated.
- `POST /api/v1/posts/:id/view` with optional `{ source: "detail" | "feed" }` records that you viewed the post (device type is read from the user agent) and returns `{ views }`. The author's own views are ignored; a repeat visit within 30 minutes isn't counted again. Requires sign-in.
- `GET /api/v1/posts/:id/engagement?type=views` (author only, otherwise 403) lists viewers with `count` (times viewed), `at` (last viewed), `firstViewedAt`, `device` and `source`.
- Feed rows include `views` (unique signed-in viewers).
- `PUT /api/v1/referrals/:id/share` records that you shared the referral (once per member) and returns `{ shares }`. `GET /api/v1/referrals?id=` returns just that referral (any status); list rows include `shares`.
- `POST /api/v1/posts/:id/comments` takes `{ text?, parentId?, uploadId? }` (text or `uploadId` required). `uploadId` is a photo or GIF from `POST /uploads`; comments return it as `media` (`/uploads/...`).
- `POST /api/v1/posts/:id/comments/:commentId/reports` with `{ category, reason? }` reports a comment (not your own); one report per member. Same categories as post reports.
- `POST /uploads` keeps GIF animation (stored as animated WebP).
- Notifications no longer include direct messages (neither in the list nor the unread count); new messages are signalled by `unreadMessages` and the realtime `message.new` event.
- `GET /api/v1/posts/:id/comments` accepts `sort=oldest|newest|top` (default `oldest`) and `filter=all|mine|replied`.
