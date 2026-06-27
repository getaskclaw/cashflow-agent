#!/usr/bin/env python3
"""Schedule a Hermes cron job to re-check an invoice on a specific date.

Usage:
    schedule_followup.py <invoice_id> <YYYY-MM-DD>

Creates a Hermes cron job via `hermes cron create` that fires once on the
given date. The job's prompt tells the agent to re-run the collections loop
for that invoice. The cron job id is logged locally to
`~/.hermes/skills/business/cashflow-agent/.scheduled_followups.jsonl` so we
can find/pause it later.
"""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "prisma", "dev.db"
)
SKILL_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(SKILL_DIR, "..", ".scheduled_followups.jsonl")
SCRIPT_DIR = SKILL_DIR


def _db_path() -> str:
    return os.environ.get("CASHFLOW_DB") or DEFAULT_DB


def _validate_date(date_str: str) -> datetime:
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError as e:
        raise ValueError(f"Date must be YYYY-MM-DD, got: {date_str}") from e
    return dt.replace(tzinfo=timezone.utc)


def _cron_schedule(date: datetime) -> str:
    # Use ISO 8601 date string for one-shot scheduling.
    # Hermes cron supports ISO timestamps for one-shot jobs.
    # This avoids the yearly recurrence problem of `0 9 D M *` cron.
    return date.strftime("%Y-%m-%dT09:00:00")


def _build_prompt(invoice_id: str, target_date: datetime) -> str:
    iso = target_date.date().isoformat()
    return (
        f"Re-check invoice {invoice_id} today ({iso}). "
        f"Run `python3 {SCRIPT_DIR}/read_customer_thread.py {invoice_id}` "
        f"to load the thread. Then check the Invoice table for the current status: "
        f"if status is still 'overdue' or 'promised' (not 'paid'), escalate the "
        f"tone one step and re-run the collections loop in the cashflow-agent skill. "
        f"If status is 'paid', do nothing and remove this cron job. "
        f"If the customer has replied since the last check, run "
        f"`python3 {SCRIPT_DIR}/parse_reply.py {invoice_id} '<reply_text>'` first. "
        f"If no new reply has been received, skip parse_reply and proceed with escalation."
    )


def _invoice_snapshot(invoice_id: str) -> dict:
    db = _db_path()
    if not os.path.exists(db):
        return {}
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT id, invoiceNumber, status, amount, currency FROM Invoice WHERE id = ?",
            (invoice_id,),
        ).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


def _log_job(record: dict) -> None:
    log_path = os.path.abspath(LOG_FILE)
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def schedule_followup(invoice_id: str, date_str: str) -> dict[str, Any]:
    target = _validate_date(date_str)
    schedule = _cron_schedule(target)
    prompt = _build_prompt(invoice_id, target)
    name = f"cashflow-followup-{invoice_id}-{target.date().isoformat()}"

    cmd = [
        "hermes",
        "cron",
        "create",
        "--name",
        name,
        "--skill",
        "cashflow-agent",
        schedule,
        prompt,
    ]

    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=60, check=False
        )
    except FileNotFoundError as e:
        raise RuntimeError("`hermes` CLI not found on PATH") from e
    if proc.returncode != 0:
        raise RuntimeError(
            f"hermes cron create failed (exit {proc.returncode}): "
            f"{proc.stderr.strip() or proc.stdout.strip()}"
        )

    output = (proc.stdout + proc.stderr).strip()
    # Try to extract the job id — Hermes prints something like
    # "Created cron job <id>" or just the id. Be permissive.
    job_id = None
    for token in output.split():
        if token and not token.startswith("Created") and len(token) >= 6:
            # Heuristic: cron ids are typically long alphanumeric strings.
            if all(ch.isalnum() or ch in "-_" for ch in token):
                job_id = token
                break
    if not job_id:
        # Fall back to the last non-empty token
        tokens = [t for t in output.split() if t]
        job_id = tokens[-1] if tokens else "unknown"

    record = {
        "invoice_id": invoice_id,
        "target_date": target.date().isoformat(),
        "schedule": schedule,
        "name": name,
        "cron_job_id": job_id,
        "raw_output": output,
        "invoice_snapshot": _invoice_snapshot(invoice_id),
        "created_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    _log_job(record)
    return record


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(
            "Usage: schedule_followup.py <invoice_id> <YYYY-MM-DD>",
            file=sys.stderr,
        )
        return 2
    try:
        result = schedule_followup(argv[1], argv[2])
    except (RuntimeError, ValueError, FileNotFoundError) as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
