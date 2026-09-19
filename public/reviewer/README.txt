# User-initiated vault deposits (Mirror Node)

- Live contract: 0.0.10853130
- Previous contract: 0.0.10682456
- Explorer (live): https://hashscan.io/mainnet/contract/0.0.10853130
- Window start (UTC): 2026-08-20T14:16:28Z (`gte:1787235388`)
- Window end (UTC): 2026-09-19T14:16:28Z (`lte:1789827388`)
- Source: Mirror `/api/v1/contracts/{id}/results` for each vault above (all pages)

Included: successful `deposit(address,uint256)` (`0x47e7ef24`) where `from` is not a vault or the operator. Unique wallets and ≥2 counts are **unioned across both vaults** so a redeploy does not reset MAU.

Not included: names, emails, recipients; operator `release()` reverts; app-database notes.

`client_id` is a one-way hash of the Hedera account id (one id per wallet). `folio_registered_wallet=yes` means that same account id exists as a Folio user wallet row — no identity fields are exported.

Files:
- `*-calls.csv` — one row per user deposit
- `*-wallets.csv` — one row per unique `from`, with deposit count
- `*-summary.json` — window and totals
