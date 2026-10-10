# Scheduled jobs

The API is an autoscale deployment: it sleeps when nobody is using the site,
so it cannot run anything on a timer, and a Replit project can only have one
deployment, so a separate Scheduled Deployment would replace the website.
Instead an outside service calls the live API every hour:

- **cron-job.org** (the main trigger) calls
  `POST /api/internal/scheduled-jobs/run-due` at 5 past each hour. It runs
  every due job in turn, inside that request, and answers with each outcome
  (500 if one failed). It stops starting new jobs after 20 seconds, because
  cron-job.org gives up after 30; the rest stay due and run next hour. GET
  works too.
- **GitHub Actions** (`.github/workflows/scheduled-jobs.yml`) is a backup
  trigger and the way to run a job by hand. GitHub skips most hourly runs
  (about 4 a day in October 2026), so it can't be the only trigger. It calls
  `POST /api/internal/scheduled-jobs/due` for the due jobs, then
  `POST /api/internal/scheduled-jobs/run/<id>` for each (`?force=1` runs
  one that is not due).

Two secrets guard them, and both are refused when missing or shorter than
32 characters:

- `SCHEDULED_JOBS_TOKEN` works on all three.
- `SCHEDULED_JOBS_CRON_TOKEN` works only on `run-due`. It is the one
  cron-job.org holds, so that service can never force a job.

Both triggers can call at once: the advisory lock runs one job at a time and
a job already done is no longer due, so nothing runs twice.

The rules live in `src/lib/scheduledJobs.ts` and the runner in
`src/jobs/runner.ts`. When each job last started and last succeeded is kept
in `ai_alert_state` (keys `scheduled_job:<id>:attempt` and `:success`), so
a failed job is retried on a later run, and an advisory lock stops two jobs
running at once.

| Job id | Code | When (UTC) |
|---|---|---|
| `onboarding-emails` | `src/jobs/onboardingEmails.ts` | Every run. Day 1, 7 and 30 emails, with up to 3 days' catch-up; each is sent once. |
| `calendar-sync` | `src/jobs/calendarSync.ts` | Every run. |
| `approval-digest` | `src/lib/approvalDigest.ts` | Daily from 08:00. Each organisation is emailed at most once a week. |
| `push-reminders` | `src/jobs/pushReminders.ts` | Daily from 18:00. Streak at risk, and recurring activities due today. |
| `monthly-digest` | `src/jobs/monthlyDigest.ts` | From 08:00 on the 1st, retried until the 3rd (after a failure, 6 hours apart). |
| `database-backup` | `src/jobs/databaseBackup.ts` | Daily from 02:00 (after a failure, 6 hours apart). Keeps 30. |
| `retention-cleanup` | `src/lib/retentionCleanup.ts`, `src/lib/emailLog.ts` | Daily from 03:00. Analytics older than 90 days, email log entries older than a year. |
| `activity-reminders` | `src/jobs/activityReminders.ts` | Every run; sends from 07:00 UK time on the day a regular activity is due, one email per occurrence. Members with push set up get push instead. |

## Database backups

`database-backup` runs `pg_dump` against the production database inside the
published app, gzips it and streams it straight into App Storage at
`<PRIVATE_OBJECT_DIR>/backups/prod-daily/myimpact-prod-<UTC time>.sql.gz`, so
no copy of the data is written to the server's disk. The newest 30 are kept.
It refuses to run outside the published app (`REPLIT_DEPLOYMENT=1`), where
`DATABASE_URL` would be the development database. A failure is emailed to
`BACKUP_NOTIFY_EMAIL` when that is set, and fails the GitHub run.

To restore, from the workspace Shell:

1. Download one:
   `pnpm --filter @workspace/api-server run backup:fetch myimpact-prod-<time>.sql.gz`
   (saved to `/tmp/myimpact-backups/`).
2. Load it into a **new, empty** database first and check it:
   `gunzip -c /tmp/myimpact-backups/<file> | psql "<that database url>"`.
   The dump drops and recreates each table, so never point it at a database
   you want to keep. For the live database, prefer Replit's own production
   restore, and use this file when that cannot reach far enough back.

`backup:db` and `backup:scheduled` are separate: they back up the development
database from the workspace.

## Setting it up

1. **Replit:** add two secrets to the production app, each a long random
   value (at least 32 characters), then republish:
   - `SCHEDULED_JOBS_TOKEN`
   - `SCHEDULED_JOBS_CRON_TOKEN` (a different value)

   `BACKUP_NOTIFY_EMAIL` (recommended) is told when a backup fails and gets a
   summary of each monthly digest.
2. **cron-job.org:** create a cron job:
   - URL `https://<live site>/api/internal/scheduled-jobs/run-due`
   - Schedule: every hour, at minute 5
   - Advanced: request method POST, request body `{}`, header
     `Authorization` = `Bearer <SCHEDULED_JOBS_CRON_TOKEN>`, timeout 30
     seconds
   - Notifications: on failure, and when it succeeds again after failing

   Use **Test run** to check it: the response lists each job.
3. **GitHub:** in the repository's Settings, Secrets and variables, Actions,
   add two repository secrets:
   - `APP_URL`: the live site, e.g. `https://myimpact.example`
   - `SCHEDULED_JOBS_TOKEN`: the same value as in Replit

   In the Actions tab, open **Scheduled jobs** and use **Run workflow** to
   test it. Until both secrets exist the workflow does nothing and says so.

## Checking it works

- cron-job.org keeps each call's status and response (the job names and
  outcomes only; errors stay in the Replit logs) and emails on failure.
- In GitHub, each run lists the due jobs and each job's HTTP status. A
  failed job fails the run, and GitHub emails the repository owner. The
  repository is public, so the log shows only job names and outcomes.
- The Replit deployment logs have the detail: lines starting
  `[scheduled-jobs] starting <id>` and `<id> succeeded|failed in N ms`, plus
  each job's own output.
- **Run workflow** with a job selected runs that job now, even if it is not
  due.
- By hand in the workspace (against the development database):
  `pnpm --filter @workspace/api-server run jobs:scheduled -- --dry-run`
  lists what is due; `-- --only <id>` runs one job.
- GitHub pauses scheduled workflows in a public repository after 60 days
  without commits, and emails a warning first. Re-enable it from the
  Actions tab if that happens.
