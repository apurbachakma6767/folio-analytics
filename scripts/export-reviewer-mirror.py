#!/usr/bin/env python3
"""Wallet-level Mirror export for reviewers. No names, emails, or recipients.

Usage (from folio-analytics/ with .env.local loaded):
  python3 scripts/export-reviewer-mirror.py
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

VAULT = os.environ.get("FOLIO_VAULT_CONTRACT_ID", "0.0.10853130").strip()
PREVIOUS = os.environ.get("FOLIO_VAULT_PREVIOUS_CONTRACT_ID", "0.0.10682456").strip()
OPERATOR = os.environ.get("HEDERA_OPERATOR_ID", "0.0.10680786").strip()
MIRROR = (
    os.environ.get("HEDERA_MIRROR_NODE_URL")
    or "https://mainnet-public.mirrornode.hedera.com"
).rstrip("/")
HASHSCAN = (
    os.environ.get("NEXT_PUBLIC_HASHSCAN_BASE") or "https://hashscan.io/mainnet"
).rstrip("/")
DEPOSIT = "47e7ef24"
WINDOW_DAYS = 30


def evm_to_account(evm: str) -> str:
    hex_part = (evm or "").replace("0x", "").lower()
    if not hex_part:
        return ""
    return f"0.0.{int(hex_part, 16)}"


def account_to_evm(account_id: str) -> str:
    num = int(account_id.strip().split(".")[2])
    return "0x" + format(num, "040x")


def opaque_id(account_id: str) -> str:
    digest = hashlib.sha256(account_id.encode("utf-8")).hexdigest()
    return f"w_{digest[:16]}"


def iso_from_mirror_ts(ts: str) -> str:
    sec = int(str(ts).split(".")[0])
    return datetime.fromtimestamp(sec, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def selector(params: str | None) -> str:
    if not params:
        return ""
    return params.replace("0x", "").lower()[:8]


def mirror_get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.load(resp)


def fetch_contract_results(contract_id: str, since_sec: int) -> list[dict]:
    out: list[dict] = []
    url = (
        f"{MIRROR}/api/v1/contracts/{contract_id}/results"
        f"?limit=100&order=asc&timestamp=gte:{since_sec}"
    )
    while url:
        data = mirror_get(url)
        out.extend(data.get("results") or [])
        nxt = (data.get("links") or {}).get("next")
        if not nxt:
            break
        url = nxt if str(nxt).startswith("http") else MIRROR + str(nxt)
    return out


def supabase_accounts() -> set[str]:
    base = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not base or not key:
        return set()
    found: set[str] = set()
    offset = 0
    while True:
        q = (
            f"{base}/rest/v1/users?select=hedera_account_id"
            f"&hedera_account_id=neq.&limit=1000&offset={offset}"
        )
        req = urllib.request.Request(
            q,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            batch = json.load(resp)
        if not batch:
            break
        for row in batch:
            aid = str(row.get("hedera_account_id") or "")
            if aid.startswith("0.0."):
                found.add(aid)
        if len(batch) < 1000:
            break
        offset += 1000
    return found


def main() -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = now - timedelta(days=WINDOW_DAYS)
    since_sec = int(start.timestamp())
    vaults = [VAULT]
    if PREVIOUS and PREVIOUS != VAULT:
        vaults.insert(0, PREVIOUS)
    operator_evm = account_to_evm(OPERATOR).lower()
    skip_evm = {account_to_evm(v).lower() for v in vaults}
    skip_evm.add(operator_evm)

    results: list[tuple[str, dict]] = []
    for cid in vaults:
        for row in fetch_contract_results(cid, since_sec):
            results.append((cid, row))
    registered = supabase_accounts()

    calls: list[dict] = []
    for cid, row in results:
        sel = selector(row.get("function_parameters"))
        if sel != DEPOSIT:
            continue
        if row.get("error_message"):
            continue
        evm = (row.get("from") or "").lower()
        if not evm or evm in skip_evm:
            continue
        account = evm_to_account(evm)
        ts = str(row.get("timestamp") or "")
        tx_id = str(row.get("transaction_id") or "")
        calls.append(
            {
                "client_id": opaque_id(account),
                "hedera_account_id": account,
                "evm_from": evm if evm.startswith("0x") else f"0x{evm}",
                "vault_contract_id": cid,
                "method": "deposit",
                "selector": f"0x{DEPOSIT}",
                "result": "SUCCESS",
                "consensus_timestamp": ts,
                "consensus_at_utc": iso_from_mirror_ts(ts) if ts else "",
                "transaction_id": tx_id,
                "explorer_url": f"{HASHSCAN}/transaction/{ts}" if ts else "",
                "folio_registered_wallet": "yes" if account in registered else "no",
            }
        )

    by_client: dict[str, list[dict]] = defaultdict(list)
    for c in calls:
        by_client[c["client_id"]].append(c)

    out_dir = Path(__file__).resolve().parents[1] / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    prefix = out_dir / f"mirror-user-deposits-{stamp}"

    call_fields = [
        "client_id",
        "hedera_account_id",
        "evm_from",
        "vault_contract_id",
        "method",
        "selector",
        "result",
        "consensus_timestamp",
        "consensus_at_utc",
        "transaction_id",
        "explorer_url",
        "folio_registered_wallet",
        "call_n_for_wallet",
    ]
    with (prefix.with_name(prefix.name + "-calls.csv")).open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=call_fields)
        w.writeheader()
        for client, rows in sorted(by_client.items(), key=lambda x: x[1][0]["consensus_timestamp"]):
            for i, row in enumerate(rows, start=1):
                out = dict(row)
                out["call_n_for_wallet"] = i
                w.writerow(out)

    wallet_fields = [
        "client_id",
        "hedera_account_id",
        "evm_from",
        "folio_registered_wallet",
        "successful_deposits",
        "first_call_utc",
        "last_call_utc",
        "qualifies_ge2",
    ]
    with (prefix.with_name(prefix.name + "-wallets.csv")).open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=wallet_fields)
        w.writeheader()
        for client, rows in sorted(by_client.items(), key=lambda x: -len(x[1])):
            n = len(rows)
            w.writerow(
                {
                    "client_id": client,
                    "hedera_account_id": rows[0]["hedera_account_id"],
                    "evm_from": rows[0]["evm_from"],
                    "folio_registered_wallet": rows[0]["folio_registered_wallet"],
                    "successful_deposits": n,
                    "first_call_utc": rows[0]["consensus_at_utc"],
                    "last_call_utc": rows[-1]["consensus_at_utc"],
                    "qualifies_ge2": "yes" if n >= 2 else "no",
                }
            )

    n2 = sum(1 for rows in by_client.values() if len(rows) >= 2)
    n1 = sum(1 for rows in by_client.values() if len(rows) == 1)
    summary = {
        "vault_contract_id": VAULT,
        "previous_vault_contract_id": PREVIOUS if PREVIOUS != VAULT else None,
        "vault_explorer": f"{HASHSCAN}/contract/{VAULT}",
        "previous_vault_explorer": f"{HASHSCAN}/contract/{PREVIOUS}" if PREVIOUS != VAULT else None,
        "mirror": [f"{MIRROR}/api/v1/contracts/{c}/results" for c in vaults],
        "window_start_utc": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window_end_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window_days": WINDOW_DAYS,
        "generated_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "included": "Successful user-paid FolioCollateralVault.deposit (0x47e7ef24) only",
        "excluded": [
            "Operator  " + OPERATOR,
            "Failed calls (including release 0x8bfb07c9)",
            "Names, emails, recipients, app-database spend notes",
        ],
        "successful_user_deposits": len(calls),
        "unique_wallets": len(by_client),
        "wallets_with_ge2_deposits": n2,
        "wallets_with_exactly_1_deposit": n1,
        "wallets_matched_to_folio_account": sum(
            1 for rows in by_client.values() if rows[0]["folio_registered_wallet"] == "yes"
        ),
        "client_id": "HMAC-free SHA-256 prefix of Hedera account id; 1:1 with on-chain wallet, not a person name",
        "distinct_clients": "Each Hedera account maps to at most one Folio users.hedera_account_id row. No PII exported.",
    }
    (prefix.with_name(prefix.name + "-summary.json")).write_text(
        json.dumps(summary, indent=2) + "\n"
    )

    readme = f"""# User-initiated vault deposits (Mirror Node)

- Live contract: {VAULT}
- Previous contract: {PREVIOUS if PREVIOUS != VAULT else "(none)"}
- Explorer (live): {HASHSCAN}/contract/{VAULT}
- Window start (UTC): {summary['window_start_utc']}
- Window end (UTC): {summary['window_end_utc']}
- Source: Mirror `/api/v1/contracts/{{id}}/results` for each vault above (all pages)

Included: successful `deposit(address,uint256)` (`0x47e7ef24`) where `from` is not a vault or the operator. Unique wallets and ≥2 counts are **unioned across both vaults** so a redeploy does not reset MAU.

Not included: names, emails, recipients; operator `release()` reverts; app-database notes.

`client_id` is a one-way hash of the Hedera account id (one id per wallet). `folio_registered_wallet=yes` means that same account id exists as a Folio user wallet row — no identity fields are exported.

Files:
- `*-calls.csv` — one row per user deposit
- `*-wallets.csv` — one row per unique `from`, with deposit count
- `*-summary.json` — window and totals
"""
    (prefix.with_name(prefix.name + "-README.txt")).write_text(readme)

    print(json.dumps(summary, indent=2))
    print("wrote", prefix.name + "-calls.csv")
    print("wrote", prefix.name + "-wallets.csv")
    print("wrote", prefix.name + "-summary.json")
    print("wrote", prefix.name + "-README.txt")


if __name__ == "__main__":
    main()
