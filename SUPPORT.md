# Support tickets

Members use `/support` to create private help requests, filter their tickets by status,
read replies, mark issues resolved, and reopen tickets. Support is also available to
signed-in members whose email verification window has expired. Unauthenticated visitors
are sent to sign in. Account suspension and session authentication are unchanged.

Administrators use `/admin/support` to view the queue, read conversations, reply, and
change status. Admin replies set the status to `waiting_on_you`; member replies set it
to `open`. Resolved or closed tickets must be reopened before either party can reply.
Explicit status changes are recorded in the conversation. Admin replies and status
changes create in-app notifications for the ticket owner.

## Database setup

Apply the normal migration workflow (`npm run db:migrate`) in the target environment
before serving these endpoints. The existing startup migration runner also discovers
`migrations/015_support_tickets.sql` and `migrations/016_support_images.sql`. They create `support_tickets` and `support_messages`
and the private `support_images` metadata table, with ownership keys, status/category/priority checks, timestamps, and queue indexes.
No migration is applied by the code-generation or static verification steps.

## API

All paths below are relative to `/api/v1` and require an active session.

| Method | Path                          | Purpose                                                    |
| ------ | ----------------------------- | ---------------------------------------------------------- |
| GET    | `/support`                    | Own tickets; `status`, `limit` (1–100), `offset`           |
| POST   | `/support`                    | Create: `subject`, `category`, `priority`, `description`   |
| GET    | `/support/:id`                | Own ticket details                                         |
| GET    | `/support/:id/messages`       | Replies and status events, newest first; `limit`, `offset` |
| POST   | `/support/:id/messages`       | Reply: `body`                                              |
| PATCH  | `/support/:id`                | Member status: `open` or `resolved`                        |
| GET    | `/admin/support`              | All tickets; same pagination and status filter             |
| GET    | `/admin/support/:id`          | Ticket details including requester name/email              |
| GET    | `/admin/support/:id/messages` | Ticket conversation                                        |
| POST   | `/admin/support/:id/messages` | Staff reply: `body`                                        |
| PATCH  | `/admin/support/:id`          | Any supported status                                       |

List responses are `{ items, total }`; message lists are arrays. Creation/replies return
`201 { id }`; status updates return `204`. Categories: `account`, `technical`, `referrals`,
`safety`, `feedback`, `other`. Priorities: `low`, `normal`, `high`. Statuses: `open`,
`in_progress`, `waiting_on_you`, `resolved`, `closed`.

Members cannot supply another owner, staff identity, or arbitrary status. Non-owned and
unknown tickets both return 404. Reply/status writes lock the ticket and commit in a
transaction. Content is rendered as plain text; no HTML is interpreted. Write rate limits
apply separately from the existing global and admin limits. This first version supports
text conversations, private image attachments, and in-app notifications. Email delivery is not included.

`test/support.test.js` contains database-free HTTP tests for ownership, admin authorization,
validation, status history, transaction rollback, and replies. Database migration execution
and browser behavior require verification in the target environment.

## Image attachments

Ticket creation and replies accept either JSON (text only) or multipart form data.
Use the same text fields plus up to **5 `images` files per submission**, each at most
**5 MB**. Supported decoded formats: JPEG, PNG, WebP, GIF. Replies still require text.
Files are decoded, oriented, resized to at most 2560 × 2560, and re-encoded as WebP.
GIF uploads are saved as a still image. Image metadata is returned in each ticket's
or reply's `images` array. Clickable previews are shown in member and admin conversations.

Files live under `PRIVATE_UPLOAD_DIR/support`, outside public uploads. Keep that directory
on persistent storage alongside the existing private chat uploads. GET
`/support/:id/images/:imageId` and `/admin/support/:id/images/:imageId` verify ticket
ownership/admin authorization before serving an image, with private/no-store caching.
Failed database writes remove newly saved files. The metadata migration enforces up to
five positions per initial report or reply and ties every reply image to its own ticket.

The Next.js API proxy allows `support` and accepts up to 27 MB for support multipart
requests, allowing overhead for five 5 MB files. Other upload limits remain unchanged.
