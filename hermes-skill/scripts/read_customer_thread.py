#!/usr/bin/env python3
"""Read the full message thread for one invoice and return it as JSON.

Usage:
    read_customer_thread.py <invoice_id>

Reads directly from the Cashflow Agent SQLite database. No Prisma client
needed — just Python stdlib.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

DEFAULT_DB = "/root/2604/cashflow-agent/prisma/dev.db"


def _db_path() -> str:
    env = os.environ.get("CASHFLOW_DB")
    if env:
        return env
    return DEFAULT_DB


def _ts_to_iso(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat()


def _ts_to_date(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).date().isoformat()


def _days_overdue(due_ms: int, now_ms: int | None = None) -> int:
    if now_ms is None:
        now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    return max(0, (now_ms - due_ms) // 86_400_000)


def read_thread(invoice_id: str) -> dict:
    db = _db_path()
    if not os.path.exists(db):
        raise FileNotFoundError(f"DB not found: {db}")

    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    try:
        inv = conn.execute(
            """
            SELECT i.id, i.invoiceNumber, i.amount, i.currency, i.description,
                   i.dueDate, i.createdAt, i.status, i.promiseDate,
                   i.paymentLinkId, i.stripePaymentId, i.paidAt,
                   c.id AS customerId, c.name AS customerName,
                   c.email AS customerEmail, c.phone AS customerPhone,
                   c.notes AS customerNotes
            FROM Invoice i
            JOIN Customer c ON c.id = i.customerId
            WHERE i.id = ?
            """,
            (invoice_id,),
        ).fetchone()
        if inv is None:
            raise ValueError(f"Invoice not found: {invoice_id}")

        comms = conn.execute(
            """
            SELECT id, direction, channel, content, agentDraft, approved,
                   sentAt, parsedStatus, parsedPromiseDate, parsedSummary,
                   createdAt
            FROM Communication
            WHERE invoiceId = ?
            ORDER BY createdAt ASC
            """,
            (invoice_id,),
        ).fetchall()

        communications = []
        prior_outbound = 0
        last_promise_date = None
        for row in comms:
            communications.append(
                {
                    "id": row["id"],
                    "direction": row["direction"],
                    "channel": row["channel"],
                    "content": row["content"],
                    "agent_draft": bool(row["agentDraft"]),
                    "approved": bool(row["approved"]),
                    "sent_at": _ts_to_iso(row["sentAt"]),
                    "parsed_status": row["parsedStatus"],
                    "parsed_promise_date": _ts_to_date(row["parsedPromiseDate"]),
                    "parsed_summary": row["parsedSummary"],
                    "created_at": _ts_to_iso(row["createdAt"]),
                }
            )
            if row["direction"] == "outbound":
                prior_outbound += 1
            if row["parsedPromiseDate"]:
                last_promise_date = _ts_to_date(row["parsedPromiseDate"])

        # Also honor Invoice.promiseDate if set on the invoice itself
        if inv["promiseDate"]:
            inv_promise = _ts_to_date(inv["promiseDate"])
            if inv_promise and (last_promise_date is None or inv_promise > last_promise_date):
                last_promise_date = inv_promise

        return {
            "invoice": {
                "id": inv["id"],
                "invoice_number": inv["invoiceNumber"],
                "amount_cents": inv["amount"],
                "amount_display": f"{(inv['amount'] or 0) / 100:.2f}",
                "currency": inv["currency"] or "usd",
                "description": inv["description"],
                "due_date": _ts_to_date(inv["dueDate"]),
                "created_at": _ts_to_date(inv["createdAt"]),
                "status": inv["status"],
                "promise_date": _ts_to_date(inv["promiseDate"]),
                "payment_link_id": inv["paymentLinkId"],
                "stripe_payment_id": inv["stripePaymentId"],
                "paid_at": _ts_to_date(inv["paidAt"]),
            },
            "customer": {
                "id": inv["customerId"],
                "name": inv["customerName"],
                "email": inv["customerEmail"],
                "phone": inv["customerPhone"],
                "notes": inv["customerNotes"],
            },
            "communications": communications,
            "days_overdue": _days_overdue(inv["dueDate"]),
            "prior_followup_count": prior_outbound,
            "last_promise_date": last_promise_date,
        }
    finally:
        conn.close()


def main(argv: list[str]) -> int:
    if len(argv) != 2 or not argv[1]:
        print("Usage: read_customer_thread.py <invoice_id>", file=sys.stderr)
        return 2
    try:
        result = read_thread(argv[1])
    except (FileNotFoundError, ValueError) as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
