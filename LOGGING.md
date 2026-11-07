# Database logging

Logging is enabled by default. Run all migrations before starting the API. Normal logs are persisted to PostgreSQL; a local durable outbox retries records when the database or logging tables are unavailable. No public log-reading API is exposed.

## Tables and captured details

| Table                 | Recorded details                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api_request_logs`    | Request ID, authenticated actor, HTTP method/path/route, query, redacted headers and JSON request/response bodies, response headers, status, request/response bytes, client IP/user agent, duration, start/completion timestamps, completed/interrupted flag |
| `application_logs`    | Severity, event name, message, structured context, error name/code/stack, request/actor IDs, hostname, process ID, event timestamp                                                                                                                           |
| `database_query_logs` | SQL template/operation, database name, parameter count/types, affected/returned rows, success/error code, duration, transaction/request/actor IDs, start/completion timestamps                                                                               |
| `audit_logs`          | Mutating HTTP action and resource, actor/request IDs, requested changes and response summary, succeeded/rejected/failed outcome, client IP, timestamp                                                                                                        |

Domain tables also retain creation/update timestamps, connection acceptance time, session creation/activity/revocation, referral closure/decisions, report/note review fields, and image metadata/checksum. See [SCHEMA.md](SCHEMA.md) for every column and index.

Every HTTP response includes a server-generated `X-Request-Id`, exposed to allowed frontend origins. The same ID appears in the request log, SQL logs, application errors, and mutation audit. Each database transaction also gets a separate transaction ID. Queries before authentication may have a null actor; subsequent queries carry the authenticated actor. Anonymous public posts remain attributable only in restricted administrative storage and logs.

## Logging application events

```js
import { applicationLog } from "./src/utils/logger.js";

await applicationLog(
  "info",
  "referral.created",
  "Referral opportunity created",
  {
    referralId,
    companyId,
  },
);
```

Use `debug`, `info`, `warn`, `error`, or `fatal`. The server installs console capture for `console.log/info/warn/error/debug`, so ordinary application console messages are also stored. Startup, graceful shutdown, fatal process errors, HTTP errors, and transaction commit/rollback events use the same logger. Migration and seed scripts install console capture and flush their logs before exiting. The logger's own failures use stderr to avoid recursively trying to log a database failure to the same unavailable database.

## Redaction and payload limits

Password, password-hash, token, secret, API-key, credential, authorization, and cookie fields are recursively replaced with `[REDACTED]`, including login responses and nested JSON. Bearer credentials inside strings are masked. SQL bind **values are never logged**: only their count and types are stored. Upload logs contain filename/type/size, not binary bytes. Static file responses record HTTP metadata and byte count; binary payloads are not duplicated into the log database.

By default each string is capped at 16,000 characters and each structured payload at 64,000 characters. Oversized JSON is stored in a valid JSON wrapper with `truncated`, original length, and a preview. Arrays/objects and recursion depth are bounded. Set `LOG_MAX_FIELD_CHARACTERS` and `LOG_MAX_PAYLOAD_CHARACTERS` in `.env` to adjust limits. Request bodies can include personal information and private chat text, so log-table access belongs only to trusted administrators. Do not expose these tables through the frontend's regular database/API credentials.

## Database outage and shutdown

Each event is written as a restricted-permission JSON file in `LOG_OUTBOX_DIR` (default `.log-outbox`) before delivery. A separate database pool writes log rows, avoiding business-transaction lock contention and recursive query logging. Successful inserts remove the outbox file. Retry runs every five seconds and when new records arrive. Stable log UUIDs make replay duplicate-safe if the process stops between insertion and file removal.

When PostgreSQL is unavailable, events remain in the outbox. They cannot appear in PostgreSQL until connectivity/schema access is restored. Keep the outbox on persistent, writable storage and monitor available disk space. Disk failures are reported to stderr. A hard process/machine failure before an asynchronous write finishes can still lose the newest in-flight event; graceful SIGINT/SIGTERM shutdown waits for pending log writes and attempts delivery before closing pools.

Keep one outbox directory per process/instance. Do not manually edit queued files. If permissions, schema changes, or a malformed queued record block replay, fix the cause and restart; do not delete undelivered records without archiving them. The outbox is ignored by Git and should be excluded from public static hosting.

## Operational queries

```sql
SELECT request_id, http_method, request_path, http_status_code,
       duration_milliseconds, actor_user_id, started_at
FROM api_request_logs
ORDER BY started_at DESC
LIMIT 100;

SELECT log_level, event_name, log_message, error_stack_trace
FROM application_logs
WHERE request_id = 'request-uuid'
ORDER BY occurred_at;

SELECT sql_operation, sql_statement_template, parameter_types,
       duration_milliseconds, was_successful, error_code
FROM database_query_logs
WHERE request_id = 'request-uuid'
ORDER BY started_at;

SELECT action_name, resource_type, resource_identifier, outcome, change_summary
FROM audit_logs
WHERE request_id = 'request-uuid'
ORDER BY occurred_at;
```

Log actor IDs intentionally have no cascading user foreign key: deleting a user must not silently erase audit history. Event timestamps, actor/request IDs, statuses, and resource IDs are indexed for operational queries. No logs are automatically deleted; define an archive/retention policy appropriate to your deployment before sustained production use. Avoid logging secrets in free-form messages: structured fields are safer and can be reliably redacted.

## Verification

`npm test` runs database-free validation/redaction tests with persistence disabled. `npm run test:integration` against a separate `_test` database checks stored request/response redaction, SQL/request correlation, mutation audits, SQL failure records, and durable replay by temporarily making the application log table unavailable, then restoring it. This test must never run against a shared or production database.
