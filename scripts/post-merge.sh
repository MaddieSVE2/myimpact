#!/bin/bash
# Reminder: when shipping a user-visible feature, also add a card to the
# latest dated section in artifacts/my-impact/src/pages/WhatsNew.tsx so the
# /whats-new page stays in sync with what's actually live.
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run migrate

# Note: we deliberately do NOT run `drizzle-kit push` here.
#
# drizzle-kit push compares the live DB against the schema files and
# applies whatever diff it sees, but it is interactive — every new table
# triggers a "create or rename?" prompt that has no way to be answered
# non-interactively (neither --force nor piping newlines work, because
# @clack/prompts reads raw keypresses from a TTY). Previously this caused
# every post-merge with a schema change to time out at 20s, leaving new
# columns/tables unapplied (e.g. Sidekick voice columns silently missed).
#
# All schema changes must instead ship with a SQL migration in
# lib/db/migrations/, applied above by the homemade migrate.ts runner.
# If you add a new table or column to the drizzle schema, add a matching
# migration file in the same PR — there is no fallback.
