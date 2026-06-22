#!/usr/bin/env python3
"""Create a Stripe payment link for an invoice and store it on the Invoice row.

Usage:
    create_payment_link.py <invoice_id>

Reads the Stripe secret key from (in order):
    1. STRIPE_SECRET_KEY env var
    2. ~/.hermes/skills/business/cashflow-agent/.stripe_key  (one-line file)
    3. StripeConnection.accessToken in the Cashflow Agent DB (first row)

Creates a Stripe Payment Link for the exact invoice amount, then updates
Invoice.paymentLinkId in the DB and prints the payment URL as JSON.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from typing import Optional

DEFAULT_DB = "/root/2604/cashflow-agent/prisma/dev.db"
KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".stripe_key")


def _db_path() -> str:
    return os.environ.get("CASHFLOW_DB") or DEFAULT_DB


def _load_stripe_key(db_path: str) -> str:
    key = os.environ.get("STRIPE_SECRET_KEY")
    if key:
        return key
    key_file = os.path.abspath(KEY_FILE)
    if os.path.exists(key_file):
        with open(key_file) as f:
            line = f.read().strip()
            if line:
                return line
    # Fall back to DB
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            "SELECT accessToken FROM StripeConnection ORDER BY connectedAt DESC LIMIT 1"
        ).fetchone()
        if row and row[0]:
            return row[0]
    finally:
        conn.close()
    raise RuntimeError(
        "No Stripe key found. Set STRIPE_SECRET_KEY, write "
        f"{os.path.abspath(KEY_FILE)}, or connect a Stripe account in the dashboard."
    )


def _get_invoice(db_path: str, invoice_id: str) -> dict:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            """
            SELECT i.id, i.invoiceNumber, i.amount, i.currency, i.description,
                   i.paymentLinkId, c.name AS customerName, c.email AS customerEmail
            FROM Invoice i
            JOIN Customer c ON c.id = i.customerId
            WHERE i.id = ?
            """,
            (invoice_id,),
        ).fetchone()
        if row is None:
            raise ValueError(f"Invoice not found: {invoice_id}")
        return dict(row)
    finally:
        conn.close()


def _save_payment_link(db_path: str, invoice_id: str, payment_link_id: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "UPDATE Invoice SET paymentLinkId = ? WHERE id = ?",
            (payment_link_id, invoice_id),
        )
        conn.commit()
    finally:
        conn.close()


def create_payment_link(invoice_id: str) -> dict:
    db_path = _db_path()
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"DB not found: {db_path}")

    invoice = _get_invoice(db_path, invoice_id)
    if invoice["paymentLinkId"]:
        # Already have one — return it without creating a duplicate.
        return {
            "invoice_id": invoice_id,
            "invoice_number": invoice["invoiceNumber"],
            "payment_link_id": invoice["paymentLinkId"],
            "payment_url": f"https://pay.stripe.com/{invoice['paymentLinkId']}",
            "reused": True,
        }

    key = _load_stripe_key(db_path)
    try:
        import stripe
    except ImportError as e:
        raise RuntimeError(
            "stripe Python library not installed. Run: pip install stripe"
        ) from e

    stripe.api_key = key

    description = invoice["description"] or f"Invoice #{invoice['invoiceNumber']}"
    name = f"Invoice #{invoice['invoiceNumber']}"

    link = stripe.PaymentLink.create(
        line_items=[
            {
                "price_data": {
                    "currency": (invoice["currency"] or "usd"),
                    "product_data": {"name": name, "description": description[:200]},
                    "unit_amount": invoice["amount"],
                },
                "quantity": 1,
            }
        ],
        metadata={
            "invoice_id": invoice_id,
            "invoice_number": invoice["invoiceNumber"],
            "customer_name": invoice["customerName"] or "",
        },
        payment_method_types=["card"],
    )

    _save_payment_link(db_path, invoice_id, link.id)

    return {
        "invoice_id": invoice_id,
        "invoice_number": invoice["invoiceNumber"],
        "payment_link_id": link.id,
        "payment_url": link.url,
        "reused": False,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: create_payment_link.py <invoice_id>", file=sys.stderr)
        return 2
    try:
        result = create_payment_link(argv[1])
    except (RuntimeError, ValueError, FileNotFoundError) as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
