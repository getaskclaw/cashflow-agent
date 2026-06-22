# Cashflow Agent 💰

> QuickBooks sends reminders. Cashflow Agent remembers what you talked about.

A smart helper that reads your customer messages and writes follow-ups that get you paid.

Built for [Hermes Agent Accelerated Business Hackathon](https://nousresearch.com) by **Nous Research × NVIDIA × Stripe**.

---

## The Problem

Small business owners spend hours chasing payments. Stripe and QuickBooks send the same message to everyone. Customers ignore them.

But a message that says *"Hey John, last week you said you'd pay on Friday. I still don't see the money"* — that works.

The problem: owners don't have time to write each one by hand.

## What This Does

When a customer hasn't paid:

```
Overdue invoice
  → Agent reads your past messages with this customer
  → Understands: what did they promise? what tone works?
  → Writes a personal follow-up for you to check
  → You say "send it"
  → Customer replies
  → Agent reads the reply: promised / question / problem
  → Updates the status
  → Sets a reminder to check again
  → Stripe confirms payment → done
```

This loop — read, write, check, understand, follow-up — is what makes it an **agent**, not a mail merge.

## How It Works

**One product. Two layers.**

| Layer | What it does | What the user sees |
|---|---|---|
| **The Agent** (Hermes) | Reads messages, writes follow-ups, understands replies, schedules next checks | Nothing — it just works in the background |
| **The Dashboard** (web app) | Shows the money board, invoice list, and action buttons | A clean website they log into |

The user never needs to know Hermes exists. They just see a dashboard. When they click "draft follow-up," an agent wakes up, reads the full conversation, decides the tone, writes the email, and schedules a check for next Tuesday. They just approve.

**That's the product: you click one button, an agent does the thinking.**

---

## Why This Matters

We looked at **14,000+ small business owner problems** on Reddit, X, and forums. Here is what we found:

| Problem | People talking about it | Tools that help |
|---|---|---|
| **Getting paid / cash flow** | **1,165** | **11** |
| Finding new customers | 980 | 47 |
| Hiring people | 720 | 32 |

Getting paid is the **#1 problem** with the **fewest solutions**. That is what we are fixing.

---

## What We Use

| Part | Tool |
|---|---|
| Website | Next.js + Tailwind CSS |
| Database | SQLite via Prisma |
| Login | NextAuth (email + Google) |
| Payments | Stripe |
| Agent | Hermes Agent |

---

## 6-Day Build Plan

| Day | What we build |
|---|---|
| **1** (Mon 6/23) | Copy the project, set up database, add demo data |
| **2** (Tue 6/24) | Build the agent: read messages, write follow-ups, understand replies |
| **3** (Wed 6/25) | Stripe payment links + payment alerts |
| **4** (Thu 6/26) | Dashboard: money board, invoice list, agent action buttons |
| **5** (Fri 6/27) | Quote system + full test of everything |
| **6** (Sat 6/28) | Polish, record 1-3 min demo |
| **Submit** (Sun 6/29) | Share video, fill in submission |

---

## 3 Main Screens

### 1. Inbox — What the agent found
```
Found:
- New request from John (roof repair, 120 sqm)
- Invoice #1042 overdue by 12 days ($3,200)
- ACME Corp said "will pay Friday"
```

### 2. Cashflow Board — Money status
| Item | Amount |
|---|---|
| Expected this week | $8,420 |
| Overdue | $3,200 |
| Collected this week | $1,150 |
| At risk | $2,400 |

### 3. Agent Actions — What the agent wants to do
- [Write quote] → for John's roof repair
- [Create link] → Stripe payment link for deposit
- [Send reminder] → personal message for invoice #1042
- [Mark paid] → Stripe confirmed the payment

---

## Getting Started

```bash
# Download
git clone https://github.com/getaskclaw/cashflow-agent.git
cd cashflow-agent

# Install
npm install

# Set up .env file (ask for the keys)
cp .env.example .env

# Set up database
npx prisma db push

# Add demo data
npx tsx prisma/seed.ts

# Start
npm run dev
```

---

## What We Are NOT Building

- ❌ Full customer manager (no deal tracking)
- ❌ Finding new customers (no prospecting)
- ❌ QuickBooks/Xero sync
- ❌ SMS or phone calls (email only for now)
- ❌ Sending without your OK (you always check first)

---

## 中文简介

Cashflow Agent 是一个帮你收钱的 AI 助手。

**它是怎么工作的：** 你点击一个按钮，后台的 AI 代理会读取你和客户的全部聊天记录，判断该用什么语气，写一封个性化的催款信，然后安排好下次跟进的时间。你只需要确认一下就行。

用户不需要知道 Hermes 是什么。他们只看到一个干净的网页面板。代理在后台做所有的思考。

**一句话：** QuickBooks 只会群发提醒。Cashflow Agent 记得你们聊过什么。

---

Built with 🜂 by [AskClaw](https://x.com/GetAskClaw)
