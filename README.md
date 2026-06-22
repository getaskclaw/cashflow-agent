# Cashflow Agent 💰

> QuickBooks sends reminders. Cashflow Agent remembers the conversation.

An AI agent that reads your customer threads and writes the follow-up that actually gets you paid.

Built for the [Hermes Agent Accelerated Business Hackathon](https://nousresearch.com) — **Nous Research × NVIDIA × Stripe**.

---

## The Problem

Small business owners waste hours chasing payments. Stripe and QuickBooks fire off the same generic reminder to everyone. Customers tune them out.

But a follow-up that says *"Hey John, you said you'd pay Friday — I still haven't seen it"* actually gets a response. The problem is nobody has time to write those by hand.

## What It Does

```
Invoice becomes overdue
  → Agent reads your full message history with this customer
  → Figures out: what was promised? what tone fits?
  → Drafts a personal follow-up
  → You approve it
  → Customer replies
  → Agent parses the reply: promised / disputed / question / ignored
  → Updates the invoice status
  → Schedules the next check
  → Still unpaid? Escalates the tone
  → Stripe webhook confirms payment → done
```

That loop — read context, draft, approve, parse reply, follow up — is what makes this an **agent**, not a mail merge.

## How It Works

**One product, two layers.**

| Layer | Does | User sees |
|---|---|---|
| **Agent** (Hermes) | Reads threads, drafts follow-ups, parses replies, schedules checks | Nothing — runs in the background |
| **Dashboard** (web app) | Money board, invoice list, action buttons | A clean dashboard they log into |

The user never needs to know Hermes exists. They click "draft follow-up" → an agent reads the full conversation, picks the right tone, writes the email, and schedules a check for next Tuesday. They just hit approve.

**That's the product: one click, the agent does the thinking.**

---

## Why This Matters

We analyzed **14,000+ small business pain signals** across Reddit, X, and forums. Here's what we found:

| Pain | Mentions | Existing solutions |
|---|---|---|
| **Cash flow / getting paid** | **1,165** | **11** |
| Customer acquisition | 980 | 47 |
| Hiring & retention | 720 | 32 |

Getting paid is the **#1 pain** with the **fewest solutions**. That's the gap we're closing.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | Next.js 14 + Tailwind CSS |
| Database | SQLite via Prisma |
| Auth | NextAuth (email + Google) |
| Payments | Stripe |
| Agent | Hermes Agent |

---

## Build Plan

| Day | Focus |
|---|---|
| **1** (Mon 6/23) | Fork project, DB schema, demo data |
| **2** (Tue 6/24) | Agent skill: read threads, draft follow-ups, parse replies |
| **3** (Wed 6/25) | Stripe payment links + webhooks |
| **4** (Thu 6/26) | Dashboard: cashflow board, invoice list, agent actions |
| **5** (Fri 6/27) | Quote drafts + end-to-end test |
| **6** (Sat 6/28) | Polish, record demo |
| **Submit** (Sun 6/29) | Ship it |

---

## Screens

### 1. Inbox — What the agent found
```
- New quote request from John (roof repair, 120 sqm)
- Invoice #1042 overdue 12 days ($3,200)
- ACME Corp promised to pay Friday
```

### 2. Cashflow Board — Money at a glance
| | Amount |
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
git clone https://github.com/getaskclaw/cashflow-agent.git
cd cashflow-agent
npm install

cp .env.example .env   # add your keys
npx prisma db push     # create tables
npx tsx prisma/seed.ts # load demo data

npm run dev
```

---

## What We're NOT Building

- ❌ CRM (no pipeline, no deal tracking)
- ❌ Lead generation
- ❌ QuickBooks / Xero sync
- ❌ SMS or phone (email only for MVP)
- ❌ Autonomous sending (human gate always)

---

## 中文简介

Cashflow Agent 是帮你把钱收回来的 AI 助手。

**工作原理：** 点一个按钮，后台的 AI 代理会读完你和这位客户的全部聊天记录，判断该用什么语气，写一封个性化的催款信，再自动安排好下次跟进的时间。你确认一下就行。

用户不需要知道 Hermes 是什么——他们只看到简洁的面板，代理在后台完成所有思考。

**一句话：** QuickBooks 只会群发提醒，Cashflow Agent 记得你们聊过什么。

---

Built with 🜂 by [AskClaw](https://x.com/GetAskClaw)
