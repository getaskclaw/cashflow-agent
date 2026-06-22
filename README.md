# Cashflow Agent 💰

> **QuickBooks reminds. Cashflow Agent remembers the conversation.**

A Hermes-powered AI agent that reads your customer conversations and writes the follow-up that actually gets you paid.

Built for the [Hermes Agent Accelerated Business Hackathon](https://nousresearch.com) presented by **Nous Research × NVIDIA × Stripe**.

[![X Post](https://img.shields.io/badge/Follow-@GetAskClaw-1DA1F2?logo=x)](https://x.com/GetAskClaw/status/2068908108114760150)

---

## The Problem

Small business owners spend hours chasing payment. QuickBooks and Stripe send generic reminders that customers ignore. But a follow-up that *references a specific conversation* — "Hey John, you said you'd pay Friday but I haven't seen it yet" — actually works.

The problem: owners don't have time to hand-write every follow-up.

## The Solution

An AI agent that lives in the loop:

```
Overdue invoice detected
  → Agent reads full email/call thread with customer
  → Understands: what was promised? what tone fits?
  → Drafts personalized follow-up referencing prior conversation
  → Human approves (always)
  → Customer replies
  → Agent parses the reply: promised / disputed / question / ignored
  → Updates status + promise date
  → Schedules next check via Hermes cron
  → Escalates tone if still unpaid
  → Stripe webhook fires → marks resolved
```

This closed loop — **read context → draft → human gate → parse reply → schedule next** — is what makes it an agent, not a mail merge.

## Why This Matters

Our data analysis of **14,000+ small business pain signals** (Reddit, X, forums) found:

| Pain Signal | Count | Solutions Available |
|---|---|---|
| **Cash flow / AR** | **1,165** | **11** |
| Customer acquisition | 980 | 47 |
| Hiring & retention | 720 | 32 |

Cash flow / AR is the #1 pain with the **fewest solutions**. That's the gap we're closing. Read the full pain analysis [on X](https://x.com/GetAskClaw/status/2068908108114760150).

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Next.js 14 (App Router)                    │
│  Dashboard · Cashflow Board · Agent Actions │
│  Stripe Connect OAuth · Webhooks            │
├─────────────────────────────────────────────┤
│  Prisma + SQLite                             │
│  Customers · Invoices · Communications       │
├─────────────────────────────────────────────┤
│  Hermes Agent (skill + cron + tools)         │
│  read_customer_thread · draft_followup       │
│  parse_reply · create_payment_link           │
│  schedule_followup · draft_quote             │
└─────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Database | SQLite via Prisma ORM |
| Auth | NextAuth (email login, Google OAuth) |
| Payments | Stripe Connect OAuth + Payment Links + Webhooks |
| Agent | Hermes Agent (skill + cron + structured tools) |

### Data Model

The three core entities:

```
Customer ──→ Invoice ──→ Communication
  │              │
  name        amount        direction (outbound/inbound)
  email       dueDate       content
  phone       status        agentDraft?
              promiseDate   parsedStatus (promised/disputed/question/ignored)
              paymentLinkId parsedPromiseDate
              stripePaymentId
```

Status machine: `pending → overdue → promised → paid` with `disputed` and `question` forks.

---

## Build Plan (6 Days)

| Day | Focus |
|---|---|
| **1** (Mon 6/23) | Fork TaxAssist, set up DB schema, seed demo data |
| **2** (Tue 6/24) | Hermes agent skill — read thread, draft follow-up, parse reply, cron schedule |
| **3** (Wed 6/25) | Stripe payment links + webhook handler |
| **4** (Thu 6/26) | Dashboard — cashflow board, invoice list, agent actions panel |
| **5** (Fri 6/27) | Quote draft layer + full integration test |
| **6** (Sat 6/28) | Polish, record 1-3 min demo video |
| **Submit** (Sun 6/29) | Tweet video + Discord submission |

---

## Three Screens

### 1. Inbox Review — What the agent found
```
Found:
- New quote request from John (roof repair, 120 sqm)
- Invoice #1042 overdue by 12 days ($3,200)
- Payment promise from ACME Corp ("will pay Friday")
```

### 2. Cashflow Board — Money status
| Metric | Amount |
|---|---|
| Expected this week | $8,420 |
| Overdue | $3,200 |
| Collected this week | $1,150 |
| At risk | $2,400 |

### 3. Agent Actions — What the agent wants to do
- [Draft quote] → for John's roof repair inquiry
- [Create link] → Stripe payment link for deposit
- [Send reminder] → personalized follow-up for invoice #1042
- [Mark paid] → Stripe webhook confirmed payment

---

## Getting Started

```bash
# Clone
git clone https://github.com/getaskclaw/cashflow-agent.git
cd cashflow-agent

# Install
npm install

# Set up env
cp .env.example .env
# Add DATABASE_URL, NEXTAUTH_SECRET, STRIPE_*

# Push DB schema
npx prisma db push

# Seed demo data
npx tsx prisma/seed.ts

# Run dev
npm run dev
```

---

## What We're NOT Building

- ❌ Full CRM (no contact management, no pipeline, no deal tracking)
- ❌ Lead scraping (no outbound prospecting)
- ❌ QuickBooks/Xero sync (no accounting integration)
- ❌ Multi-channel reminders (email only for MVP)
- ❌ Autonomous sending without approval (human gate always)

---

Built with 🜂 by [AskClaw](https://x.com/GetAskClaw)
