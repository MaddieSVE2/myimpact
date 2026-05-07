# API server scripts

One-off utility scripts for the My Impact API server. Run with `tsx` via the
package scripts in `artifacts/api-server/package.json`.

## Database backup

`backup-db.ts` — produces a timestamped, plain-SQL `pg_dump` of the database
at `DATABASE_URL`, writes it to `artifacts/api-server/backups/`, then uploads
it to App Storage under `<PRIVATE_OBJECT_DIR>/backups/`.

```bash
pnpm --filter @workspace/api-server run backup:db
```

Required environment:

- `DATABASE_URL` — Postgres connection string. Set automatically when a
  Replit-managed database is provisioned for the project.
- `PRIVATE_OBJECT_DIR` — e.g. `/replit-objstore-xxxx/.private`. Set
  automatically when App Storage is provisioned for the project.

What it prints:

- Local file path and size of the dump.
- Per-table row count for every table in the `public` schema (sanity check).
- App Storage object key and a re-confirmation that the upload exists.

Optional flags:

- `--gzip` (alias `--downloadable`) also writes a `.sql.gz` copy alongside
  the plain `.sql` dump for sharing as a smaller download. The plain
  `.sql` file is still what gets uploaded to App Storage.

Operational notes:

- The dump format is plain SQL (`pg_dump` defaults). The dump is streamed
  to App Storage so memory use stays flat regardless of database size.
- Local `backups/` and root-level `myimpact-db-backup-*.sql*` files are
  gitignored so dumps cannot be committed by accident.

Example output (truncated):

```
[1/4] Running pg_dump → /home/runner/workspace/artifacts/api-server/backups/myimpact-db-backup-2026-05-02T0812.sql
      Wrote 28.0 KB (28648 bytes)

[2/4] Collecting per-table row counts...
      _migrations        8
      feedback           0
      impact_records     3
      journal_entries    0
      magic_tokens       11
      org_members        1
      org_registrations  0
      organisations      1
      page_views         2
      public_profiles    0
      user_profiles      2
      users              5
      TOTAL              33

[3/4] Uploading to App Storage
      gs://replit-objstore-…/.private/backups/myimpact-db-backup-2026-05-02T0812.sql

[4/4] Verifying upload...
      Confirmed: 28648 bytes in App Storage.

✅ Backup complete.
   App Storage key:   /replit-objstore-…/.private/backups/myimpact-db-backup-2026-05-02T0812.sql
```

## Fetching backups

`fetch-backup.ts` — lists every backup in App Storage and downloads either
the latest or a named one to `/tmp/myimpact-backups/`.

```bash
# Download the most recent backup
pnpm --filter @workspace/api-server run backup:fetch

# Download a specific backup by trailing filename match
pnpm --filter @workspace/api-server run backup:fetch myimpact-db-backup-2026-05-02T0803.sql
```

## Demo seed

`seed-demo.ts` — idempotently creates the demo users, organisation, and
memberships used for screenshots and demos.

```bash
pnpm --filter @workspace/api-server run seed:demo
```

Demo accounts created/updated by this script (and recognised by
`/api/auth/request` as instant-login persona accounts when
`ENABLE_DEMO_LOGIN=true` / `VITE_ENABLE_DEMO_LOGIN=true`):

- `demo@demo.org` — regular **member** of the Demo Organisation.
- `organisation@organisation.org` — **manager** of the Demo Organisation.
  After login the client is redirected straight to the org portal (`/org`),
  where all manager-only sections (members list, invite link, SSO config,
  surveys, billing) are visible.

Other persona logins (individual side, no org membership):

- `volunteer@volunteer.org`, `student@student.org`, `carer@carer.org`,
  `veteran@veteran.org`, `apprentice@apprentice.org`,
  `jobseeker@jobseeker.org`.
