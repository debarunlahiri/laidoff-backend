# Database structure

The canonical schema is built by migrations 001–003. Migration 002 upgrades existing records without rebuilding tables. Migration 003 adds four independent logging tables. Standard `id` columns are UUID primary keys; foreign keys identify the related entity explicitly. API aliases such as `name` and `text` remain compatible while storage uses descriptive names.

All domain tables have `created_at` and `updated_at`. UTC timestamps use millisecond precision. JSON holds variable-length profile skill lists and structured log metadata; relationships use foreign keys and uniqueness constraints. The reference SQL snapshot is [database/schema.sql](database/schema.sql); use `npm run db:migrate` for setup/upgrades.

## api_request_logs

| Column                  | MySQL type             | Nullable | Default              | Key / lifecycle |
| ----------------------- | ---------------------- | -------- | -------------------- | --------------- |
| `id`                    | `char(36)`             | NO       | NULL                 | PRI             |
| `request_id`            | `char(36)`             | NO       | NULL                 | UNI             |
| `actor_user_id`         | `char(36)`             | YES      | NULL                 | MUL             |
| `http_method`           | `varchar(16)`          | NO       | NULL                 |                 |
| `request_path`          | `varchar(2048)`        | NO       | NULL                 |                 |
| `route_pattern`         | `varchar(512)`         | YES      | NULL                 |                 |
| `request_query`         | `json`                 | YES      | NULL                 |                 |
| `request_headers`       | `json`                 | YES      | NULL                 |                 |
| `request_body`          | `json`                 | YES      | NULL                 |                 |
| `response_headers`      | `json`                 | YES      | NULL                 |                 |
| `response_body`         | `json`                 | YES      | NULL                 |                 |
| `http_status_code`      | `smallint(5) unsigned` | NO       | NULL                 | MUL             |
| `response_size_bytes`   | `bigint(20) unsigned`  | NO       | 0                    |                 |
| `request_size_bytes`    | `bigint(20) unsigned`  | YES      | NULL                 |                 |
| `duration_milliseconds` | `decimal(14,3)`        | NO       | NULL                 |                 |
| `client_ip_address`     | `varchar(45)`          | YES      | NULL                 |                 |
| `client_user_agent`     | `varchar(1024)`        | YES      | NULL                 |                 |
| `response_completed`    | `tinyint(1)`           | NO       | NULL                 |                 |
| `started_at`            | `datetime(3)`          | NO       | NULL                 | MUL             |
| `completed_at`          | `datetime(3)`          | NO       | NULL                 |                 |
| `created_at`            | `timestamp(3)`         | NO       | CURRENT_TIMESTAMP(3) |                 |

Indexes: `PRIMARY` (`id`); `uq_api_request_logs_request_id` (`request_id`); `idx_api_logs_user_started` (`actor_user_id`, `started_at`); `idx_api_logs_status_started` (`http_status_code`, `started_at`); `idx_api_logs_started` (`started_at`).

## application_logs

| Column               | MySQL type                                    | Nullable | Default              | Key / lifecycle |
| -------------------- | --------------------------------------------- | -------- | -------------------- | --------------- |
| `id`                 | `char(36)`                                    | NO       | NULL                 | PRI             |
| `request_id`         | `char(36)`                                    | YES      | NULL                 | MUL             |
| `actor_user_id`      | `char(36)`                                    | YES      | NULL                 |                 |
| `log_level`          | `enum('debug','info','warn','error','fatal')` | NO       | NULL                 | MUL             |
| `event_name`         | `varchar(160)`                                | NO       | NULL                 | MUL             |
| `log_message`        | `text`                                        | NO       | NULL                 |                 |
| `log_context`        | `json`                                        | YES      | NULL                 |                 |
| `error_name`         | `varchar(160)`                                | YES      | NULL                 |                 |
| `error_code`         | `varchar(160)`                                | YES      | NULL                 |                 |
| `error_stack_trace`  | `mediumtext`                                  | YES      | NULL                 |                 |
| `process_identifier` | `int(10) unsigned`                            | NO       | NULL                 |                 |
| `host_name`          | `varchar(255)`                                | NO       | NULL                 |                 |
| `occurred_at`        | `datetime(3)`                                 | NO       | NULL                 |                 |
| `created_at`         | `timestamp(3)`                                | NO       | CURRENT_TIMESTAMP(3) |                 |

Indexes: `PRIMARY` (`id`); `idx_application_logs_request` (`request_id`); `idx_application_logs_level_time` (`log_level`, `occurred_at`); `idx_application_logs_event_time` (`event_name`, `occurred_at`).

## audit_logs

| Column                | MySQL type                              | Nullable | Default              | Key / lifecycle |
| --------------------- | --------------------------------------- | -------- | -------------------- | --------------- |
| `id`                  | `char(36)`                              | NO       | NULL                 | PRI             |
| `request_id`          | `char(36)`                              | YES      | NULL                 | MUL             |
| `actor_user_id`       | `char(36)`                              | YES      | NULL                 | MUL             |
| `action_name`         | `varchar(160)`                          | NO       | NULL                 |                 |
| `resource_type`       | `varchar(100)`                          | NO       | NULL                 | MUL             |
| `resource_identifier` | `varchar(160)`                          | YES      | NULL                 |                 |
| `outcome`             | `enum('succeeded','rejected','failed')` | NO       | NULL                 |                 |
| `change_summary`      | `json`                                  | YES      | NULL                 |                 |
| `client_ip_address`   | `varchar(45)`                           | YES      | NULL                 |                 |
| `occurred_at`         | `datetime(3)`                           | NO       | NULL                 |                 |
| `created_at`          | `timestamp(3)`                          | NO       | CURRENT_TIMESTAMP(3) |                 |

Indexes: `PRIMARY` (`id`); `idx_audit_logs_actor_time` (`actor_user_id`, `occurred_at`); `idx_audit_logs_resource` (`resource_type`, `resource_identifier`); `idx_audit_logs_request` (`request_id`).

## bookmarks

| Column       | MySQL type     | Nullable | Default              | Key / lifecycle                |
| ------------ | -------------- | -------- | -------------------- | ------------------------------ |
| `post_id`    | `char(36)`     | NO       | NULL                 | PRI                            |
| `user_id`    | `char(36)`     | NO       | NULL                 | PRI                            |
| `created_at` | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at` | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`post_id`, `user_id`); `user_id` (`user_id`).

## comments

| Column            | MySQL type     | Nullable | Default              | Key / lifecycle                |
| ----------------- | -------------- | -------- | -------------------- | ------------------------------ |
| `id`              | `char(36)`     | NO       | NULL                 | PRI                            |
| `post_id`         | `char(36)`     | NO       | NULL                 | MUL                            |
| `user_id`         | `char(36)`     | NO       | NULL                 | MUL                            |
| `comment_content` | `text`         | NO       | NULL                 |                                |
| `created_at`      | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`      | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`id`); `user_id` (`user_id`); `post_id` (`post_id`, `created_at`).

## community_notes

| Column                | MySQL type                              | Nullable | Default              | Key / lifecycle                |
| --------------------- | --------------------------------------- | -------- | -------------------- | ------------------------------ |
| `id`                  | `char(36)`                              | NO       | NULL                 | PRI                            |
| `post_id`             | `char(36)`                              | NO       | NULL                 | MUL                            |
| `user_id`             | `char(36)`                              | NO       | NULL                 | MUL                            |
| `note_content`        | `text`                                  | NO       | NULL                 |                                |
| `source_url`          | `varchar(2048)`                         | NO       | NULL                 |                                |
| `review_status`       | `enum('pending','approved','rejected')` | NO       | pending              | MUL                            |
| `created_at`          | `timestamp(3)`                          | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`          | `timestamp(3)`                          | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |
| `reviewed_at`         | `datetime(3)`                           | YES      | NULL                 |                                |
| `reviewed_by_user_id` | `char(36)`                              | YES      | NULL                 | MUL                            |
| `review_reason`       | `varchar(2000)`                         | YES      | NULL                 |                                |

Indexes: `PRIMARY` (`id`); `post_id` (`post_id`); `user_id` (`user_id`); `fk_community_notes_reviewer` (`reviewed_by_user_id`); `idx_community_notes_review` (`review_status`, `created_at`).

## companies

| Column                  | MySQL type      | Nullable | Default              | Key / lifecycle                |
| ----------------------- | --------------- | -------- | -------------------- | ------------------------------ |
| `id`                    | `char(36)`      | NO       | NULL                 | PRI                            |
| `company_name`          | `varchar(160)`  | NO       | NULL                 | UNI                            |
| `created_at`            | `timestamp(3)`  | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`            | `timestamp(3)`  | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |
| `company_description`   | `text`          | YES      | NULL                 |                                |
| `website_url`           | `varchar(2048)` | YES      | NULL                 |                                |
| `industry_name`         | `varchar(160)`  | YES      | NULL                 |                                |
| `headquarters_location` | `varchar(160)`  | YES      | NULL                 |                                |
| `is_active`             | `tinyint(1)`    | NO       | 1                    |                                |

Indexes: `PRIMARY` (`id`); `name` (`company_name`).

## connections

| Column                 | MySQL type                   | Nullable | Default              | Key / lifecycle                |
| ---------------------- | ---------------------------- | -------- | -------------------- | ------------------------------ |
| `id`                   | `char(36)`                   | NO       | NULL                 | PRI                            |
| `requester_id`         | `char(36)`                   | NO       | NULL                 | MUL                            |
| `recipient_id`         | `char(36)`                   | NO       | NULL                 | MUL                            |
| `participant_pair_key` | `varchar(73)`                | NO       | NULL                 | UNI                            |
| `connection_status`    | `enum('pending','accepted')` | NO       | pending              |                                |
| `created_at`           | `timestamp(3)`               | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`           | `timestamp(3)`               | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |
| `accepted_at`          | `datetime(3)`                | YES      | NULL                 |                                |

Indexes: `PRIMARY` (`id`); `pair_key` (`participant_pair_key`); `idx_connections_recipient_status` (`recipient_id`, `connection_status`, `created_at`); `idx_connections_requester_status` (`requester_id`, `connection_status`, `created_at`).

## conversations

| Column                       | MySQL type     | Nullable | Default              | Key / lifecycle                |
| ---------------------------- | -------------- | -------- | -------------------- | ------------------------------ |
| `id`                         | `char(36)`     | NO       | NULL                 | PRI                            |
| `first_participant_user_id`  | `char(36)`     | NO       | NULL                 | MUL                            |
| `second_participant_user_id` | `char(36)`     | NO       | NULL                 | MUL                            |
| `participant_pair_key`       | `varchar(73)`  | NO       | NULL                 | UNI                            |
| `created_at`                 | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`                 | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`id`); `pair_key` (`participant_pair_key`); `user_a` (`first_participant_user_id`); `user_b` (`second_participant_user_id`).

## daily_reminders

| Column                     | MySQL type     | Nullable | Default              | Key / lifecycle                |
| -------------------------- | -------------- | -------- | -------------------- | ------------------------------ |
| `id`                       | `char(36)`     | NO       | NULL                 | PRI                            |
| `reminder_quote`           | `varchar(300)` | NO       | NULL                 | UNI                            |
| `reminder_supporting_text` | `varchar(300)` | NO       | NULL                 |                                |
| `display_order`            | `int`          | NO       | 0                    |                                |
| `is_active`                | `tinyint(1)`   | NO       | 1                    |                                |
| `created_at`               | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`               | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`id`); `uq_daily_reminders_quote` (`reminder_quote`); `idx_daily_reminders_active_order` (`is_active`,`display_order`,`id`). Added by migration 005; rows are editable content. Add, reorder or retire reminders by changing rows, not code.

## database_query_logs

| Column                   | MySQL type            | Nullable | Default              | Key / lifecycle |
| ------------------------ | --------------------- | -------- | -------------------- | --------------- |
| `id`                     | `char(36)`            | NO       | NULL                 | PRI             |
| `request_id`             | `char(36)`            | YES      | NULL                 | MUL             |
| `actor_user_id`          | `char(36)`            | YES      | NULL                 |                 |
| `database_name`          | `varchar(128)`        | NO       | NULL                 |                 |
| `sql_operation`          | `varchar(32)`         | NO       | NULL                 |                 |
| `sql_statement_template` | `mediumtext`          | NO       | NULL                 |                 |
| `parameter_count`        | `int(10) unsigned`    | NO       | NULL                 |                 |
| `parameter_types`        | `json`                | YES      | NULL                 |                 |
| `affected_row_count`     | `bigint(20) unsigned` | YES      | NULL                 |                 |
| `returned_row_count`     | `bigint(20) unsigned` | YES      | NULL                 |                 |
| `duration_milliseconds`  | `decimal(14,3)`       | NO       | NULL                 |                 |
| `was_successful`         | `tinyint(1)`          | NO       | NULL                 | MUL             |
| `error_code`             | `varchar(160)`        | YES      | NULL                 |                 |
| `error_message`          | `text`                | YES      | NULL                 |                 |
| `transaction_id`         | `char(36)`            | YES      | NULL                 | MUL             |
| `started_at`             | `datetime(3)`         | NO       | NULL                 |                 |
| `completed_at`           | `datetime(3)`         | NO       | NULL                 |                 |
| `created_at`             | `timestamp(3)`        | NO       | CURRENT_TIMESTAMP(3) |                 |

Indexes: `PRIMARY` (`id`); `idx_database_logs_request` (`request_id`); `idx_database_logs_success_started` (`was_successful`, `started_at`); `idx_database_logs_transaction` (`transaction_id`).

## follows

| Column        | MySQL type     | Nullable | Default              | Key / lifecycle                |
| ------------- | -------------- | -------- | -------------------- | ------------------------------ |
| `follower_id` | `char(36)`     | NO       | NULL                 | PRI                            |
| `followed_id` | `char(36)`     | NO       | NULL                 | PRI                            |
| `created_at`  | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`  | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`follower_id`, `followed_id`); `idx_follows_followed_created` (`followed_id`, `created_at`).

## hidden_posts

| Column       | MySQL type     | Nullable | Default              | Key / lifecycle                |
| ------------ | -------------- | -------- | -------------------- | ------------------------------ |
| `post_id`    | `char(36)`     | NO       | NULL                 | PRI                            |
| `user_id`    | `char(36)`     | NO       | NULL                 | PRI                            |
| `created_at` | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at` | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`post_id`, `user_id`); `user_id` (`user_id`).

## messages

| Column            | MySQL type     | Nullable | Default              | Key / lifecycle                |
| ----------------- | -------------- | -------- | -------------------- | ------------------------------ |
| `id`              | `char(36)`     | NO       | NULL                 | PRI                            |
| `conversation_id` | `char(36)`     | NO       | NULL                 | MUL                            |
| `sender_id`       | `char(36)`     | NO       | NULL                 | MUL                            |
| `message_content` | `text`         | NO       | NULL                 |                                |
| `read_at`         | `datetime(3)`  | YES      | NULL                 |                                |
| `created_at`      | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`      | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`id`); `sender_id` (`sender_id`); `conversation_id` (`conversation_id`, `created_at`); `idx_messages_unread` (`conversation_id`, `sender_id`, `read_at`).

## notifications

| Column                 | MySQL type     | Nullable | Default              | Key / lifecycle                |
| ---------------------- | -------------- | -------- | -------------------- | ------------------------------ |
| `id`                   | `char(36)`     | NO       | NULL                 | PRI                            |
| `user_id`              | `char(36)`     | NO       | NULL                 | MUL                            |
| `actor_id`             | `char(36)`     | NO       | NULL                 | MUL                            |
| `notification_type`    | `varchar(40)`  | NO       | NULL                 |                                |
| `resource_id`          | `char(36)`     | YES      | NULL                 |                                |
| `notification_message` | `varchar(300)` | NO       | NULL                 |                                |
| `read_at`              | `datetime(3)`  | YES      | NULL                 |                                |
| `created_at`           | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`           | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`id`); `actor_id` (`actor_id`); `user_id` (`user_id`, `created_at`); `idx_notifications_unread` (`user_id`, `read_at`, `created_at`).

## posts

| Column         | MySQL type     | Nullable | Default              | Key / lifecycle                |
| -------------- | -------------- | -------- | -------------------- | ------------------------------ |
| `id`           | `char(36)`     | NO       | NULL                 | PRI                            |
| `user_id`      | `char(36)`     | NO       | NULL                 | MUL                            |
| `post_content` | `text`         | NO       | NULL                 |                                |
| `post_topic`   | `varchar(80)`  | NO       | General discussion   | MUL                            |
| `company_id`   | `char(36)`     | YES      | NULL                 | MUL                            |
| `is_anonymous` | `tinyint(1)`   | NO       | 0                    |                                |
| `upload_id`    | `char(36)`     | YES      | NULL                 | MUL                            |
| `created_at`   | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | MUL                            |
| `updated_at`   | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`id`); `user_id` (`user_id`); `upload_id` (`upload_id`); `created_at` (`created_at`); `topic` (`post_topic`); `company_id` (`company_id`).

## reactions

| Column          | MySQL type               | Nullable | Default              | Key / lifecycle                |
| --------------- | ------------------------ | -------- | -------------------- | ------------------------------ |
| `post_id`       | `char(36)`               | NO       | NULL                 | PRI                            |
| `user_id`       | `char(36)`               | NO       | NULL                 | PRI                            |
| `reaction_type` | `enum('like','dislike')` | NO       | NULL                 |                                |
| `created_at`    | `timestamp(3)`           | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`    | `timestamp(3)`           | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`post_id`, `user_id`); `user_id` (`user_id`).

## referrals

| Column            | MySQL type              | Nullable | Default              | Key / lifecycle                |
| ----------------- | ----------------------- | -------- | -------------------- | ------------------------------ |
| `id`              | `char(36)`              | NO       | NULL                 | PRI                            |
| `user_id`         | `char(36)`              | NO       | NULL                 | MUL                            |
| `company_id`      | `char(36)`              | NO       | NULL                 | MUL                            |
| `job_title`       | `varchar(120)`          | NO       | NULL                 |                                |
| `job_location`    | `varchar(160)`          | NO       | NULL                 |                                |
| `required_skills` | `varchar(200)`          | NO       | NULL                 |                                |
| `job_description` | `text`                  | YES      | NULL                 |                                |
| `referral_status` | `enum('open','closed')` | NO       | open                 |                                |
| `created_at`      | `timestamp(3)`          | NO       | CURRENT_TIMESTAMP(3) | MUL                            |
| `updated_at`      | `timestamp(3)`          | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |
| `closed_at`       | `datetime(3)`           | YES      | NULL                 |                                |

Indexes: `PRIMARY` (`id`); `created_at` (`created_at`); `idx_referrals_company_status` (`company_id`, `referral_status`, `created_at`); `idx_referrals_owner_status` (`user_id`, `referral_status`, `created_at`).

## referral_requests

| Column                | MySQL type                              | Nullable | Default              | Key / lifecycle                |
| --------------------- | --------------------------------------- | -------- | -------------------- | ------------------------------ |
| `referral_id`         | `char(36)`                              | NO       | NULL                 | PRI                            |
| `user_id`             | `char(36)`                              | NO       | NULL                 | PRI                            |
| `request_status`      | `enum('pending','accepted','declined')` | NO       | pending              |                                |
| `created_at`          | `timestamp(3)`                          | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`          | `timestamp(3)`                          | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |
| `decision_at`         | `datetime(3)`                           | YES      | NULL                 |                                |
| `decision_by_user_id` | `char(36)`                              | YES      | NULL                 | MUL                            |

Indexes: `PRIMARY` (`referral_id`, `user_id`); `user_id` (`user_id`); `fk_referral_requests_decision_user` (`decision_by_user_id`).

## reports

| Column                | MySQL type                                                           | Nullable | Default              | Key / lifecycle                |
| --------------------- | -------------------------------------------------------------------- | -------- | -------------------- | ------------------------------ |
| `id`                  | `char(36)`                                                           | NO       | NULL                 | PRI                            |
| `post_id`             | `char(36)`                                                           | NO       | NULL                 | MUL                            |
| `user_id`             | `char(36)`                                                           | NO       | NULL                 | MUL                            |
| `report_category`     | `enum('spam','harassment','misinformation','inappropriate','other')` | NO       | other                | MUL                            |
| `report_reason`       | `varchar(1000)`                                                      | NO       | NULL                 |                                |
| `created_at`          | `timestamp(3)`                                                       | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`          | `timestamp(3)`                                                       | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |
| `report_status`       | `enum('pending','reviewing','resolved','dismissed')`                 | NO       | pending              | MUL                            |
| `resolution_summary`  | `varchar(2000)`                                                      | YES      | NULL                 |                                |
| `reviewed_at`         | `datetime(3)`                                                        | YES      | NULL                 |                                |
| `reviewed_by_user_id` | `char(36)`                                                           | YES      | NULL                 | MUL                            |

Indexes: `PRIMARY` (`id`); `post_id` (`post_id`, `user_id`); `user_id` (`user_id`); `fk_reports_reviewer` (`reviewed_by_user_id`); `idx_reports_status_created` (`report_status`, `created_at`); `idx_reports_category` (`report_category`).

## reposts

| Column       | MySQL type     | Nullable | Default              | Key / lifecycle                |
| ------------ | -------------- | -------- | -------------------- | ------------------------------ |
| `post_id`    | `char(36)`     | NO       | NULL                 | PRI                            |
| `user_id`    | `char(36)`     | NO       | NULL                 | PRI                            |
| `created_at` | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at` | `timestamp(3)` | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |

Indexes: `PRIMARY` (`post_id`, `user_id`); `user_id` (`user_id`).

## sessions

| Column             | MySQL type      | Nullable | Default              | Key / lifecycle                |
| ------------------ | --------------- | -------- | -------------------- | ------------------------------ |
| `token_hash`       | `char(64)`      | NO       | NULL                 | PRI                            |
| `user_id`          | `char(36)`      | NO       | NULL                 | MUL                            |
| `expires_at`       | `datetime(3)`   | NO       | NULL                 | MUL                            |
| `created_at`       | `timestamp(3)`  | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`       | `timestamp(3)`  | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |
| `revoked_at`       | `datetime(3)`   | YES      | NULL                 |                                |
| `last_activity_at` | `datetime(3)`   | YES      | NULL                 |                                |
| `login_ip_address` | `varchar(45)`   | YES      | NULL                 |                                |
| `login_user_agent` | `varchar(1024)` | YES      | NULL                 |                                |

Indexes: `PRIMARY` (`token_hash`); `expires_at` (`expires_at`); `idx_sessions_user_expiration` (`user_id`, `expires_at`, `revoked_at`).

## uploads

| Column                | MySQL type            | Nullable | Default              | Key / lifecycle                |
| --------------------- | --------------------- | -------- | -------------------- | ------------------------------ |
| `id`                  | `char(36)`            | NO       | NULL                 | PRI                            |
| `user_id`             | `char(36)`            | NO       | NULL                 | MUL                            |
| `stored_file_name`    | `varchar(100)`        | NO       | NULL                 | UNI                            |
| `created_at`          | `timestamp(3)`        | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`          | `timestamp(3)`        | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |
| `original_file_name`  | `varchar(255)`        | YES      | NULL                 |                                |
| `mime_type`           | `varchar(100)`        | NO       | image/webp           |                                |
| `file_size_bytes`     | `bigint(20) unsigned` | YES      | NULL                 |                                |
| `image_width_pixels`  | `int(10) unsigned`    | YES      | NULL                 |                                |
| `image_height_pixels` | `int(10) unsigned`    | YES      | NULL                 |                                |
| `sha256_checksum`     | `char(64)`            | YES      | NULL                 |                                |

Indexes: `PRIMARY` (`id`); `filename` (`stored_file_name`); `idx_uploads_owner_created` (`user_id`, `created_at`).

## users

| Column                  | MySQL type                                 | Nullable | Default              | Key / lifecycle                |
| ----------------------- | ------------------------------------------ | -------- | -------------------- | ------------------------------ |
| `id`                    | `char(36)`                                 | NO       | NULL                 | PRI                            |
| `email`                 | `varchar(254)`                             | NO       | NULL                 | UNI                            |
| `password_hash`         | `varchar(255)`                             | NO       | NULL                 |                                |
| `full_name`             | `varchar(100)`                             | NO       | NULL                 |                                |
| `professional_headline` | `varchar(160)`                             | NO       |                      |                                |
| `biography`             | `text`                                     | YES      | NULL                 |                                |
| `professional_skills`   | `json`                                     | YES      | NULL                 |                                |
| `career_objective`      | `text`                                     | YES      | NULL                 |                                |
| `open_to_work`          | `tinyint(1)`                               | NO       | 0                    |                                |
| `created_at`            | `timestamp(3)`                             | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`            | `timestamp(3)`                             | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |
| `account_status`        | `enum('active','suspended','deactivated')` | NO       | active               | MUL                            |
| `email_verified_at`     | `datetime(3)`                              | YES      | NULL                 |                                |
| `last_login_at`         | `datetime(3)`                              | YES      | NULL                 |                                |
| `profile_location`      | `varchar(160)`                             | NO       |                      |                                |
| `profile_image_url`     | `varchar(2048)`                            | YES      | NULL                 |                                |
| `website_url`           | `varchar(2048)`                            | YES      | NULL                 |                                |
| `linkedin_profile_url`  | `varchar(2048)`                            | YES      | NULL                 |                                |
| `profile_visibility`    | `enum('public','members')`                 | NO       | members              |                                |

Indexes: `PRIMARY` (`id`); `email` (`email`); `idx_users_status_created` (`account_status`, `created_at`).

## workforce_reports

| Column                    | MySQL type                         | Nullable | Default              | Key / lifecycle                |
| ------------------------- | ---------------------------------- | -------- | -------------------- | ------------------------------ |
| `id`                      | `char(36)`                         | NO       | NULL                 | PRI                            |
| `company_id`              | `char(36)`                         | NO       | NULL                 | MUL                            |
| `user_id`                 | `char(36)`                         | NO       | NULL                 | MUL                            |
| `event_date`              | `date`                             | NO       | NULL                 | MUL                            |
| `reported_roles_affected` | `int(10) unsigned`                 | NO       | NULL                 |                                |
| `reported_headcount`      | `int(10) unsigned`                 | YES      | NULL                 |                                |
| `reported_hires`          | `int(10) unsigned`                 | YES      | NULL                 |                                |
| `source_url`              | `varchar(2048)`                    | NO       | NULL                 |                                |
| `verification_status`     | `enum('user_reported','verified')` | NO       | user_reported        |                                |
| `created_at`              | `timestamp(3)`                     | NO       | CURRENT_TIMESTAMP(3) |                                |
| `updated_at`              | `timestamp(3)`                     | NO       | CURRENT_TIMESTAMP(3) | on update CURRENT_TIMESTAMP(3) |
| `verified_at`             | `datetime(3)`                      | YES      | NULL                 |                                |
| `verified_by_user_id`     | `char(36)`                         | YES      | NULL                 | MUL                            |
| `verification_summary`    | `varchar(2000)`                    | YES      | NULL                 |                                |

Indexes: `PRIMARY` (`id`); `company_id` (`company_id`); `user_id` (`user_id`); `event_date` (`event_date`); `fk_workforce_reports_verifier` (`verified_by_user_id`).

## comments.parent_comment_id / comment_reactions (migration 008)

`comments.parent_comment_id` (nullable, FK to `comments.id`, cascade) links a reply to its top-level comment; replies never nest deeper. `comment_reactions(comment_id, user_id, reaction_type like|dislike, created_at, updated_at)` stores one reaction per user per comment.

## users.cover_image_url (migration 009)

Optional path of the member's uploaded cover image. `PUT /me/images/profile|cover` with `{uploadId}` (an upload the caller owns) sets the avatar or cover; `DELETE /me/images/profile|cover` clears it. A Google sign-in no longer overwrites an uploaded profile photo.

## Referral feedback, filters and request forms (migration 011)

`referrals` gains `work_mode`, `experience_level`, `min_experience_years` and `request_fields` (JSON list of questions the referrer wants answered). `referral_requests` gains `request_message` and `request_answers` (JSON). `referral_feedback(referral_id, user_id, feedback_type helpful|not_helpful)` holds one vote per requester. Files go in `referral_documents` (stored under `PRIVATE_UPLOAD_DIR`, never served statically) and are linked to a request through `referral_request_documents`.

## message_attachments

Files attached to chat messages (`013_message_attachments.sql`): `id`, `message_id` (FK to `messages`, cascade), `stored_file_name`, `original_file_name`, `mime_type`, `file_size_bytes`, `created_at`. Files are stored under `PRIVATE_UPLOAD_DIR` and only served to the two conversation participants. A message with only files has an empty `message_content`.

## post_polls, post_poll_options, post_poll_votes

Polls on posts (`014_polls.sql`). `post_polls(post_id, allow_multiple, closes_at)` holds one poll per post (`closes_at` NULL means it never closes). `post_poll_options(id, post_id, option_text, display_position)` holds 2-6 options. `post_poll_votes(option_id, post_id, user_id)` has one row per chosen option; single-choice polls are enforced in the API by replacing the member's votes. All three cascade when the post is deleted.

## post_shares

Shares of a post (`015_post_shares.sql`). `post_shares(post_id, user_id, created_at)` has one row per member per post; the share count is the row count. Cascades when the post or user is deleted.

## post_views

Who viewed a post (`016_post_views.sql`). `post_views(post_id, user_id, view_count, device, source, first_viewed_at, last_viewed_at)` has one row per member per post; `device` is mobile/tablet/desktop and `source` is where it was opened (`detail` or `feed`). Cascades when the post or user is deleted. Only the post's author can list viewers.

## referral_shares

Shares of a referral (`017_referral_shares.sql`). `referral_shares(referral_id, user_id, created_at)` has one row per member per referral; the share count is the row count. Cascades when the referral or user is deleted.

## comments.upload_id, comment_reports

`comments.upload_id` (`018_comment_media_reports.sql`) optionally points at a photo or GIF in `uploads` (set to NULL if the upload is removed). `comment_reports(id, comment_id, user_id, report_category, report_reason, report_status, created_at)` holds reports against comments, one per member per comment, with the same categories and review statuses as post reports. Cascades when the comment or user is deleted.
