# Email log and replies

## What is recorded

- **Every email sent** goes through `getUncachableResendClient(category)`
  (`src/lib/resend.ts`), which records it in `email_log`: recipients,
  subject, category, Resend id and status. Never the body. A send that
  fails is recorded as `failed` with the error. Logging never blocks a send.
- **Delivery events** from Resend's webhook (`POST /api/email/resend-webhook`)
  move each entry on: `delivered`, `delayed`, `opened`, `clicked`, or
  `bounced`, `complained`, `suppressed`, `failed`. Late or out-of-order
  events never move an entry backwards. Bounces and complaints also go on
  the suppression list as before.
- **Replies.** Member emails (every category except `internal`, unless
  the email sets its own Reply-To) carry `Reply-To: EMAIL_REPLY_TO`. Resend
  receives all mail for the domain and sends `email.received` to the same
  webhook; only mail to the reply inbox is handled here (log@ is the
  activity inbox, below; hello@ and others are ignored). Each reply is stored once in `email_replies` with
  its text, linked to the latest member email sent to that person, and a
  plain-text copy is forwarded to `EMAIL_REPLY_FORWARD_TO` with the member
  as Reply-To, so answering it goes straight to them.
- Admins see both at **`/admin/email-log`** (Sent and Replies).
- Entries and replies are deleted after 12 months (`retention-cleanup`
  scheduled job) and when the person deletes their account, including team
  emails whose subject names them.

## Setup

1. **Database:** in the Replit Shell run
   `pnpm --filter @workspace/db run migrate` (adds `email_log` and
   `email_replies`), then republish so production gets the same tables.
2. **Replit secrets** for the published app:
   - `RESEND_WEBHOOK_SECRET`: the signing secret from step 3
   - `EMAIL_REPLY_TO`: `reply@myimpact.uk`
   - `EMAIL_REPLY_FORWARD_TO`: who gets a copy of each reply, comma
     separated, e.g. `enquiries@socialvalueengine.com`
3. **Resend:** Webhooks, Add endpoint
   `https://myimpact.uk/api/email/resend-webhook`, with the events
   `email.sent`, `email.delivered`, `email.delivery_delayed`,
   `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`,
   `email.opened`, `email.clicked` and `email.received`. Copy its signing
   secret into `RESEND_WEBHOOK_SECRET`. Opens and clicks are only reported
   when tracking is switched on for the sending domain.
4. Republish.

Until `EMAIL_REPLY_TO` is set, emails get no Reply-To and received mail is
ignored. Without `RESEND_WEBHOOK_SECRET` the webhook refuses every event,
so the log shows only `sent` and `failed`.

## Adding an email

Always get the client with a category:

```ts
const { client, fromEmail } = await getUncachableResendClient("organisation");
```

Use `internal` for alerts to the team; those never get the reply inbox.

## Activity reminders

`activity-reminders` (see SCHEDULING.md) emails members on the morning a
regular activity is due, one email per day listing everything due. It is a
service email, on by default: `users.email_reminders_opt_in`, switched in
Settings or by the signed one-click link in each email (unsubscribe token
list `activity-reminders`). Members with push set up and on get push only.
The button opens the app's due prompt; the email never logs anything,
because mail scanners follow links.

## Activity inbox (test only)

People email what they did to `EMAIL_ACTIVITY_INBOX` (log@myimpact.uk) and
it is added to their record (`src/lib/emailActivityInbox.ts`, rules in
`src/lib/emailActivity.ts`). It is not part of any member email yet: only
senders listed in `EMAIL_ACTIVITY_TEST_SENDERS` are read, and only into demo
accounts. Everything else sent there is stored and ignored.

- The AI reads the sender's new text (quoted history and signature
  dropped) together with the open conversation, and matches it to the
  activity list. The server then checks the answer: a known activity, a
  date within the last year and not in the future, and hours (for hour
  activities) or a count (people, trees and so on). Sessions, workshops,
  events, households and donations count as one per occasion. Money
  donations are valued as donations.
- **Complete:** each item becomes a Quick Log entry (`kind` quick_log, name
  "Logged by email", `result_json.capturedBy` "email", plus any outcome
  they mention as `emailNote`), valued as Quick Log values it. The same
  activity already logged that day is not added again. The reply lists
  each entry with its value.
- **Missing something:** one short question goes back (Reply-To the
  activity inbox), and the answer is read with the earlier emails. After
  two unanswered or still-incomplete rounds, or for anything that isn't a
  simple activity (support questions, "stop emailing me", "delete my
  data", anything worrying), it goes to `EMAIL_REPLY_FORWARD_TO` and the
  sender is told the team will look.
- **Evidence** is never taken by email. When the person's organisation
  collects submissions, the reply links each entry to
  `/org/share-report/<id>`, where they log in, add a photo if the
  organisation requires one, and send it. The usual evidence check there
  applies, so email can't skip it.
- Automatic replies, bounces, our own addresses and more than 30 emails a
  day from one sender are never answered. Webhook retries are harmless
  (each email is claimed once).
- Each email is kept in `email_activity_messages` with its outcome, and
  deleted with the email log (12 months) and with the sender's account.

**To test:**

1. In the Replit Shell run `pnpm --filter @workspace/db run migrate` (adds
   `email_activity_messages`) **before** republishing.
2. Replit secrets: `EMAIL_ACTIVITY_INBOX` = `log@myimpact.uk`, and
   `EMAIL_ACTIVITY_TEST_SENDERS` = `<your address>=demo@demo.org` (more
   pairs comma separated; the account must be a demo persona, or the pair
   is dropped). Sign in to the demo account once first.
3. Republish, then email log@myimpact.uk from that address.

To switch it off, remove `EMAIL_ACTIVITY_INBOX`.
