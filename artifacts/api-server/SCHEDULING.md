# Scheduled jobs

The API is an autoscale deployment: it sleeps when nobody is using the site,
so it cannot run anything on a timer, and a Replit project can only have one
deployment, so a separate Scheduled Deployment would replace the website.
Instead a GitHub Actions workflow (`.github/workflows/scheduled-jobs.yml`)
calls the live API every hour:

1. `POST /api/internal/scheduled-jobs/due` returns the jobs that are due.
2. `POST /api/internal/scheduled-jobs/run/<id>` runs one of them, inside
   that request, and returns its outcome.

Both need `Authorization: Bearer <SCHEDULED_JOBS_TOKEN>` and refuse every
request when that secret is missing or shorter than 32 characters.

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

The database backup (`backup:scheduled`) is not one of these: it is written
for the development database and runs from the Replit workspace. Replit
keeps its own restore points for the production database.

## Setting it up

1. **Replit:** add a secret `SCHEDULED_JOBS_TOKEN` to the production app,
   a long random value (at least 32 characters), then republish.
   `BACKUP_NOTIFY_EMAIL` (optional) gets a summary of each monthly digest.
2. **GitHub:** in the repository's Settings, Secrets and variables, Actions,
   add two repository secrets:
   - `APP_URL`: the live site, e.g. `https://myimpact.example`
   - `SCHEDULED_JOBS_TOKEN`: the same value as in Replit
3. In the Actions tab, open **Scheduled jobs** and use **Run workflow** to
   test it straight away.

Until both GitHub secrets exist the workflow does nothing and says so.

## Checking it works

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
