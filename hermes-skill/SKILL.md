---
name: cashflow-agent
description: "Reply-aware collections agent for Cashflow Agent"
version: 1.0.0
author: Cashflow Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [Cashflow, Stripe, Collections, Agent]
    related_skills: []
---

# Cashflow Agent — Reply-Aware Collections

This skill turns the Cashflow Agent dashboard into a working collections agent.
It reads overdue invoices from the local Prisma/SQLite database, drafts
context-aware follow-up emails, parses customer replies, and schedules
automatic re-checks via Hermes cron.

The agent never sends anything without human approval. Every outbound message
is drafted first, shown to the operator, and only recorded as a Communication
row once approved.

## Project layout

- App repo: `/root/2604/cashflow-agent`
- SQLite DB: `/root/2604/cashflow-agent/prisma/dev.db`
- Prisma schema: `/root/2604/cashflow-agent/prisma/schema.prisma`

Models used by this skill: `Customer`, `Invoice`, `Communication`,
`StripeConnection`, `Transaction`. See the schema for full field definitions.
Status flow on `Invoice.status`:

```
pending → overdue → promised → paid
```

## Scripts

All scripts live under `scripts/` relative to this skill and are runnable
standalone. They use only Python 3 stdlib plus `stripe` (only
`create_payment_link.py`).

| Script | Purpose |
|--------|---------|
| `scripts/read_customer_thread.py <invoice_id>` | Pull the full message history for one invoice as JSON |
| `scripts/draft_followup.py <invoice_id>` | Generate a personalized follow-up email draft via Hermes CLI |
| `scripts/parse_reply.py <invoice_id> <reply_text>` | Classify a customer reply into promised/disputed/question/ignored |
| `scripts/create_payment_link.py <invoice_id>` | Create a Stripe payment link and store it on the invoice |
| `scripts/schedule_followup.py <invoice_id> <YYYY-MM-DD>` | Schedule a Hermes cron re-check for an invoice |

## Decision logic

When the operator asks the agent to "run collections" (or words to that
effect), follow this loop exactly:

### 1. Find overdue invoices

Query the `Invoice` table for `status = 'overdue'`. For each overdue invoice:

### 2. Read the customer thread

```bash
python3 scripts/read_customer_thread.py <invoice_id>
```

The script returns JSON with: customer name + email, invoice details (number,
amount, currency, due date, description), every `Communication` row sorted
oldest → newest, days overdue, prior outbound follow-up count, and the last
promise date (if any).

### 3. Analyze the thread

Before drafting, reason about the thread:

- **How many days overdue?** Use `days_overdue` from the thread JSON.
- **What was previously promised?** Look at the last inbound message and any
  `parsedPromiseDate` on prior communications.
- **What tone fits?** Pick from `polite` → `firm` → `final` based on overdue
  duration and prior broken promises:
  - 0–7 days overdue, no prior promise broken → `polite`
  - 8–30 days overdue, or one broken promise → `firm`
  - 30+ days overdue, or two+ broken promises → `final`
  - Customer explicitly friendly / long relationship → `friendly`

### 4. Draft the follow-up

```bash
python3 scripts/draft_followup.py <invoice_id>
```

The script calls `hermes chat -q '...'` under the hood and returns JSON with
`draft` (the email body) and `suggested_tone`. If the script's tone disagrees
with your analysis from step 3, prefer your analysis and ask the script to
redraft by editing the prompt — but the script's output is a fine default.

### 5. Present the draft for human approval

Show the operator:

- The customer name and invoice number
- The suggested tone and why
- The full draft text
- A yes/no prompt: "Send this?"

Do **not** send or record anything until the operator approves.

### 6. Record the communication

Once approved, insert a new `Communication` row:

- `invoiceId` = the invoice id
- `direction` = `outbound`
- `channel` = `email`
- `content` = the approved draft
- `agentDraft` = `true`
- `approved` = `true`
- `sentAt` = now

Use `sqlite3` directly (the same DB path the scripts use) or the project's
Prisma client if running inside the Next.js process.

### 7. Schedule a follow-up check 3 days later

```bash
python3 scripts/schedule_followup.py <invoice_id> <YYYY-MM-DD>
```

where the date is `today + 3 days` in `YYYY-MM-DD` form. The script creates a
Hermes cron job and logs its id locally so we can find/pause it later.

### 8. When a customer replies

When a new inbound `Communication` arrives (the operator pastes it in, or an
inbox integration drops it in), run:

```bash
python3 scripts/parse_reply.py <invoice_id> "<reply_text>"
```

The script returns JSON:

```json
{
  "parsed_status": "promised|disputed|question|ignored",
  "parsed_promise_date": "2026-06-25" | null,
  "parsed_summary": "short summary",
  "recommended_tone": "polite|firm|final|friendly",
  "next_action": "check_payment|escalate|wait|human_needed"
}
```

### 9. If `parsed_status == 'promised'`

- Update `Invoice.status = 'promised'`
- Set `Invoice.promiseDate` to `parsed_promise_date`
- Update the inbound `Communication` row with `parsedStatus`, `parsedPromiseDate`,
  `parsedSummary`

### 10. Schedule a check for the day after the promise date

```bash
python3 scripts/schedule_followup.py <invoice_id> <day_after_promise_date>
```

The cron job prompt should say: "Check whether invoice `<invoice_id>` was paid
on its promised date `<promise_date>`. If `Invoice.status` is still
`promised` (not `paid`), re-run the collections loop with a `firm` tone."

### 11. If `parsed_status` is `disputed` or `question`

Alert the human. Do **not** auto-draft a reply. Set
`Communication.parsedStatus` and `parsedSummary`, then surface the thread to
the operator with a short explanation of why human input is needed.

### 12. If ignored by the scheduled check

When a scheduled cron job fires and finds the invoice still overdue (no reply,
no payment), escalate the tone one step:

- `polite` → `firm`
- `firm` → `final`
- `final` → alert human (do not draft further; consider small-claims / handoff)

Re-run steps 4–7 with the escalated tone. Always re-confirm with the human
before sending.

## Hard rules

- **Never send without approval.** Drafts only — the operator clicks send.
- **Never delete or rewrite** an existing `Communication` row. Append only.
- **Never log secrets.** Stripe keys stay in env / `StripeConnection.accessToken`,
  never in `Communication.content` or cron prompts.
- **Always quote the invoice number and amount** in any draft so the customer
  can match it to their records.
- **Always include the payment link** if `Invoice.paymentLinkId` is set; if
  not, offer to create one via `create_payment_link.py` before drafting.

## Quick start

```bash
# From the skill directory
cd ~/.hermes/skills/business/cashflow-agent

# See all overdue invoices
sqlite3 /root/2604/cashflow-agent/prisma/dev.db \
  "SELECT id, invoiceNumber, amount, dueDate FROM Invoice WHERE status='overdue';"

# Pull the thread for one of them
python3 scripts/read_customer_thread.py <invoice_id>

# Draft a follow-up
python3 scripts/draft_followup.py <invoice_id>

# Parse a reply that came in
python3 scripts/parse_reply.py <invoice_id> "I'll pay next Friday"

# Create a Stripe payment link for the invoice
python3 scripts/create_payment_link.py <invoice_id>

# Schedule a re-check in 3 days
python3 scripts/schedule_followup.py <invoice_id> $(date -d +3days +%F)
```
