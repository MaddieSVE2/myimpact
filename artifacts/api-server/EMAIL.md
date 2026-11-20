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

## Activity inbox

People email what they did to `EMAIL_ACTIVITY_INBOX` (log@myimpact.uk) and
it is added to their record (`src/lib/emailActivityInbox.ts`, rules in
`src/lib/emailActivity.ts`). It is not mentioned in any member email yet.

Three settings decide who is read:

| Setting | Effect |
| --- | --- |
| `EMAIL_ACTIVITY_INBOX` | The address. Without it the feature is off. |
| `EMAIL_ACTIVITY_LIVE` = `true` | Members are read: an email from an account's address is added to that member's own record. |
| `EMAIL_ACTIVITY_TEST_SENDERS` | `<address>=<demo account>` pairs. These senders are read into the demo account instead, live or not. Optional. |

Without `EMAIL_ACTIVITY_LIVE`, only the test senders are read and everything
else sent there is stored (sender and subject) and ignored.

**Who an email is really from.** A From address is easy to forge, so a
member's email is only read when Resend's receiving server confirmed it came
from that address's domain: DMARC passed, or DKIM passed (the
`authentication` Resend returns with the received email; an SPF pass alone
is not enough). Otherwise nothing is added, nothing they wrote is kept, and
they are told once a day to log it in the app instead. Gmail, Outlook,
Yahoo and iCloud all pass. A work or university address whose domain signs
nothing will not; these show as "Sender not confirmed" in the admin view.

**An address with no account** is told so once a week (they may have signed
up with another address), only when the sender is confirmed, and for at
most 20 such addresses a day. Mail claiming to be from a demo account is
ignored.

Admins see every email sent to the inbox and what happened to it at
**`/admin/email-log`**, Activity inbox.

- The AI reads the sender's new text (quoted history and signature
  dropped) together with the open conversation, and matches it to the
  activity list. Nothing is assumed: the server checks the answer for a
  known activity, a date they gave (within the last year, not in the
  future; today only if they said "today", "this morning" or similar),
  how long they spent (always), and a count where the activity is counted
  (people, trees and so on; sessions, workshops, events and households are
  one per occasion). Where it happened is asked once and saved on the
  entry, but never holds it back. Money donations are valued as donations.
- Replies: the AI writes the questions and a one-line thanks about what
  they did (no praise, no exclamation marks, no em dashes); the facts in
  the confirmation (date, hours, place, value, links) are filled in by the
  server. A question is sent on its own ("Thanks. Roughly how long did
  you spend at the community garden?"); confirmations and notices are
  signed "My Impact".
- Replies are sent as `My Impact <EMAIL_ACTIVITY_INBOX>` (the address the
  member wrote to) and name the member's email (In-Reply-To), so they sit
  under it in the member's mail app. This needs the inbox's domain to be
  verified for sending in Resend. If Resend refuses that sender, the
  reply goes from the usual sender instead, and the inbox's address is not
  tried again for an hour; the refused send shows as Failed in the email
  log.
- **Complete:** each item becomes a Quick Log entry (`kind` quick_log, name
  "Logged by email", `result_json.capturedBy` "email", plus any outcome
  they mention as `emailNote`), valued as Quick Log values it. The same
  activity already logged that day is not added again. The reply lists
  each entry with its value.
- **Missing something:** one short question covering everything missing goes back (Reply-To the
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
  day from one sender are never read or answered. Webhook retries are harmless
  (each email is claimed once).
- Each email is kept in `email_activity_messages` with its outcome, and
  deleted with the email log (12 months) and with the sender's account.

**To switch it on for members:**

1. In the Replit Shell run `pnpm --filter @workspace/db run migrate` (adds
   `email_activity_messages`) **before** republishing.
2. Resend: the webhook must include `email.received` (Setup, above).
3. Replit secrets: `EMAIL_ACTIVITY_INBOX` = `log@myimpact.uk` and
   `EMAIL_ACTIVITY_LIVE` = `true`.
4. Republish, then email log@myimpact.uk from the address you sign in with.

**To try it on a demo account only:** leave `EMAIL_ACTIVITY_LIVE` unset and
set `EMAIL_ACTIVITY_TEST_SENDERS` = `<your address>=demo@demo.org` (more
pairs comma separated; the account must be a demo persona, or the pair is
dropped). Sign in to the demo account once first.

To stop reading members' emails, remove `EMAIL_ACTIVITY_LIVE`. To switch
the inbox off altogether, remove `EMAIL_ACTIVITY_INBOX`.
