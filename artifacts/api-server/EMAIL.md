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
  webhook; only mail to the reply inbox is handled (hello@, log@ and other
  inboxes are ignored). Each reply is stored once in `email_replies` with
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
