#!/usr/bin/env python3
"""Draft a personalized follow-up email for an overdue invoice.

Usage:
    draft_followup.py <invoice_id> [--tone polite|firm|final|friendly]

Reads the customer thread via read_customer_thread, builds a prompt, and
calls the Hermes CLI (`hermes chat -q '...'`) to generate the draft. Returns
JSON with the draft body and the tone that was used.
"""
from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from typing import Any

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
READ_THREAD = os.path.join(SCRIPT_DIR, "read_customer_thread.py")


def _pick_tone(thread: dict, override: str | None) -> str:
    if override:
        return override
    days = thread.get("days_overdue", 0)
    prior = thread.get("prior_followup_count", 0)
    last_promise = thread.get("last_promise_date")
    # Long relationship + first follow-up → friendly
    if prior <= 1 and days <= 7 and not last_promise:
        return "friendly"
    if days <= 7:
        return "polite"
    if days <= 30:
        return "firm"
    return "final"


def _build_prompt(thread: dict, tone: str) -> str:
    inv = thread["invoice"]
    cust = thread["customer"]
    comms = thread["communications"]

    history_lines = []
    for c in comms:
        who = "Customer" if c["direction"] == "inbound" else "Us"
        date = (c.get("sent_at") or c.get("created_at") or "")[:10]
        history_lines.append(f"[{date}] {who}: {c['content'].strip()}")
    history = "\n".join(history_lines) or "(no prior messages)"

    last_promise = thread.get("last_promise_date")
    promise_note = (
        f"The customer previously promised to pay by {last_promise} — that date has passed."
        if last_promise
        else "No prior promise on file."
    )

    return (
        f"You are a collections agent for a small business. Draft a {tone} follow-up "
        f"email to a customer about an overdue invoice. Use plain text, no markdown. "
        f"Keep it under 150 words. Always reference the invoice number and amount. "
        f"Do not invent facts. Sign off as 'Alex, Roofing Pro'.\n\n"
        f"Customer: {cust['name']} <{cust['email']}>\n"
        f"Customer notes: {cust.get('notes') or '(none)'}\n"
        f"Invoice: #{inv['invoice_number']} for {inv['amount_display']} {inv['currency'].upper()} "
        f"(due {inv['due_date']}, {thread['days_overdue']} days overdue)\n"
        f"Description: {inv.get('description') or '(none)'}\n"
        f"Prior follow-ups sent: {thread['prior_followup_count']}\n"
        f"{promise_note}\n\n"
        f"Full message history (oldest first):\n{history}\n\n"
        f"Write only the email body. Start with 'Hi {cust['name'].split()[0]},'."
    )


def _call_hermes(prompt: str) -> str:
    # -q = one-shot query, -Q = quiet (no surrounding chatter)
    cmd = ["hermes", "chat", "-q", prompt, "-Q"]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except FileNotFoundError:
        raise RuntimeError("`hermes` CLI not found on PATH")
    if proc.returncode != 0:
        raise RuntimeError(
            f"hermes chat failed (exit {proc.returncode}): {proc.stderr.strip()}"
        )
    return proc.stdout.strip()


def draft_followup(invoice_id: str, tone_override: str | None = None) -> dict[str, Any]:
    proc = subprocess.run(
        ["python3", READ_THREAD, invoice_id],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"read_customer_thread failed: {proc.stderr.strip()}")
    thread = json.loads(proc.stdout)

    tone = _pick_tone(thread, tone_override)
    prompt = _build_prompt(thread, tone)
    draft = _call_hermes(prompt)

    return {
        "invoice_id": invoice_id,
        "invoice_number": thread["invoice"]["invoice_number"],
        "customer_name": thread["customer"]["name"],
        "customer_email": thread["customer"]["email"],
        "suggested_tone": tone,
        "draft": draft,
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Draft a follow-up email.")
    parser.add_argument("invoice_id")
    parser.add_argument(
        "--tone",
        choices=["polite", "firm", "final", "friendly"],
        default=None,
    )
    args = parser.parse_args(argv[1:])

    try:
        result = draft_followup(args.invoice_id, args.tone)
    except (RuntimeError, ValueError, FileNotFoundError) as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
