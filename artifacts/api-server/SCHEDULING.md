# Scheduled jobs

The API server is an autoscale deployment, so it sleeps when nobody is using
the site and cannot be relied on to run anything on a timer. Every background
job that must run on time is run instead by **one Replit Scheduled
Deployment**, once an hour:

```bash
pnpm --filter @workspace/api-server run jobs:scheduled
```

That runner (`src/scripts/run-scheduled-jobs.ts`) checks which jobs are due,
runs each due job as its own process, and records when each last started and
last succeeded (in `ai_alert_state`, keys `scheduled_job:<id>:attempt` and
`:success`). A failed job is retried on a later run. The rules live in
`src/lib/scheduledJobs.ts` and are covered by `tests/scheduledJobs.test.ts`.

| Job id | Script | When (UTC) |
|---|---|---|
| `onboarding-emails` | `onboarding-emails.ts` | Every run. Day 1, 7 and 30 emails, with up to 3 days' catch-up; each is sent once. |
| `calendar-sync` | `sync-calendars.ts --prune` | Every run. |
| `approval-digest` | `approval-digest.ts` | Daily from 08:00. Each organisation is emailed at most once a week. |
| `push-reminders` | `send-push-reminders.ts` | Daily from 18:00. Streak at risk, and recurring activities due today. |
| `monthly-digest` | `send-monthly-digest.ts --skip-recently-sent` | From 08:00 on the 1st, retried until the 3rd. |
| `database-backup` | `backup-db.ts --prune --keep 12` | Every 7 days. |

After a failure, the monthly digest and the backup wait 6 hours before
retrying, because both email a failure notice. The digest and the backup only
get `--notify` when `BACKUP_NOTIFY_EMAIL` is set; without a recipient the
backup script would refuse to run.

## Setting it up in Replit

1. Open the **Publishing** pane and create a new deployment of type
   **Scheduled**.
2. **Build command:** `pnpm install --frozen-lockfile`
3. **Run command:** `pnpm --filter @workspace/api-server run jobs:scheduled`
4. **Schedule:** every hour, on the hour (cron `0 * * * *`).
5. **Timeout:** 50 minutes. The runner also refuses to start while a
   previous run still holds its lock.
6. **Secrets:** the same values the live app uses. In particular:
   - `DATABASE_URL`: the **production** database
   - `RESEND_API_KEY`, `APP_URL`
   - `SESSION_SECRET`: signs the unsubscribe links, so it must match the
     live app or those links will fail
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` for push
   - `PRIVATE_OBJECT_DIR` for backups
   - `BACKUP_NOTIFY_EMAIL` (recommended): where backup and digest summaries go

## Checking it works

- Run `pnpm --filter @workspace/api-server run jobs:scheduled -- --dry-run`
  to list what is due without running anything.
- Run `... jobs:scheduled -- --only <job id>` to run one job straight away,
  for example `--only database-backup` after setup.
- Each run's log starts with `[scheduled-jobs] <time>: due ...` and ends with
  `[scheduled-jobs] done: N succeeded, M failed`. A run with a failed job
  exits non-zero, so Replit marks it as failed.
