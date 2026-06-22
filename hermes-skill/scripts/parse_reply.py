#!/usr/bin/env python3
"""Parse a customer reply and classify it for the collections workflow.

Usage:
    parse_reply.py <invoice_id> "<reply_text>"

Calls the Hermes CLI to classify the reply into one of:
    promised | disputed | question | ignored

Returns JSON with parsed_status, parsed_promise_date (ISO or null),
parsed_summary, recommended_tone, and next_action.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
READ_THREAD = os.path.join(SCRIPT_DIR, "read_customer_thread.py")

VALID_STATUSES = {"promised", "disputed", "question", "ignored"}
VALID_TONES = {"polite", "firm", "final", "friendly"}
VALID_ACTIONS = {"check_payment", "escalate", "wait", "human_needed"}


def _read_thread(invoice_id: str) -> dict:
    proc = subprocess.run(
        ["python3", READ_THREAD, invoice_id],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"read_customer_thread failed: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


def _build_prompt(thread: dict, reply_text: str) -> str:
    inv = thread["invoice"]
    cust = thread["customer"]
    history = []
    for c in thread["communications"]:
        who = "Customer" if c["direction"] == "inbound" else "Us"
        history.append(f"{who}: {c['content'].strip()}")
    history_str = "\n".join(history) or "(none)"

    today = datetime.now(tz=timezone.utc).date().isoformat()

    return (
        "You are a collections agent assistant. Classify the customer's reply "
        "and respond with ONLY a JSON object — no markdown, no prose.\n\n"
        "Schema:\n"
        "{\n"
        '  "parsed_status": "promised" | "disputed" | "question" | "ignored",\n'
        '  "parsed_promise_date": "YYYY-MM-DD" or null,\n'
        '  "parsed_summary": "one-sentence summary",\n'
        '  "recommended_tone": "polite" | "firm" | "final" | "friendly",\n'
        '  "next_action": "check_payment" | "escalate" | "wait" | "human_needed"\n'
        "}\n\n"
        "Rules:\n"
        "- parsed_status='promised' only if the customer commits to a specific date.\n"
        "- parsed_promise_date must be a real date in YYYY-MM-DD, in the future relative to today.\n"
        "  Resolve vague phrases ('next Friday', 'end of week') to an actual date.\n"
        "- parsed_status='disputed' if the customer disputes the charge or quality of work.\n"
        "- parsed_status='question' if the customer asks a question that needs a human answer.\n"
        "- parsed_status='ignored' if the reply is non-responsive or no reply at all.\n"
        f"- Today is {today}.\n\n"
        f"Customer: {cust['name']}\n"
        f"Invoice: #{inv['invoice_number']} for {inv['amount_display']} {inv['currency'].upper()} "
        f"(due {inv['due_date']}, {thread['days_overdue']} days overdue)\n"
        f"Prior follow-ups: {thread['prior_followup_count']}\n"
        f"Last promise on file: {thread.get('last_promise_date') or 'none'}\n\n"
        f"Prior message history:\n{history_str}\n\n"
        f"Customer's new reply to classify:\n\"\"\"\n{reply_text}\n\"\"\"\n\n"
        "Return only the JSON object."
    )


def _call_hermes(prompt: str) -> str:
    try:
        proc = subprocess.run(
            ["hermes", "chat", "-q", prompt, "-Q"],
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


def _extract_json(text: str) -> dict:
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strip code fences
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))
    # Find first {...} block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    raise ValueError(f"Could not extract JSON from hermes output: {text[:200]}")


def _coerce(parsed: dict) -> dict:
    status = parsed.get("parsed_status", "ignored")
    if status not in VALID_STATUSES:
        status = "ignored"
    tone = parsed.get("recommended_tone", "polite")
    if tone not in VALID_TONES:
        tone = "polite"
    action = parsed.get("next_action", "wait")
    if action not in VALID_ACTIONS:
        action = "wait"

    promise = parsed.get("parsed_promise_date")
    if promise:
        try:
            datetime.strptime(promise, "%Y-%m-%d")
        except (ValueError, TypeError):
            promise = None

    return {
        "parsed_status": status,
        "parsed_promise_date": promise,
        "parsed_summary": str(parsed.get("parsed_summary", "")).strip(),
        "recommended_tone": tone,
        "next_action": action,
    }


def parse_reply(invoice_id: str, reply_text: str) -> dict[str, Any]:
    if not reply_text or not reply_text.strip():
        # No reply at all = ignored
        thread = _read_thread(invoice_id)
        return {
            "parsed_status": "ignored",
            "parsed_promise_date": None,
            "parsed_summary": "No reply received by the scheduled check.",
            "recommended_tone": "firm" if thread["days_overdue"] <= 30 else "final",
            "next_action": "escalate",
            "invoice_id": invoice_id,
        }

    thread = _read_thread(invoice_id)
    prompt = _build_prompt(thread, reply_text)
    raw = _call_hermes(prompt)
    parsed = _extract_json(raw)
    result = _coerce(parsed)
    result["invoice_id"] = invoice_id
    result["invoice_number"] = thread["invoice"]["invoice_number"]
    return result


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("Usage: parse_reply.py <invoice_id> \"<reply_text>\"", file=sys.stderr)
        return 2
    invoice_id = argv[1]
    reply_text = argv[2]
    try:
        result = parse_reply(invoice_id, reply_text)
    except (RuntimeError, ValueError, FileNotFoundError) as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
