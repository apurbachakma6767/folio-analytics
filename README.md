# Folio analytics

Internal dashboard for vault custody, stock collateral, spends, repayments, and contract MAU.

Lives **outside** the Folio app (`../folio-analytics`). Read-only: Supabase (wallets + spend notes) and Hedera Mirror Node (vault contract calls + HTS balances). No operator keys.

## Run

```bash
cd /Users/aakash/workspace/apurbachakma6767/folio-analytics
npm install
npm run dev          # http://localhost:3100
```

Required in `.env.local`:

- `FOLIO_VAULT_CONTRACT_ID` (live vault)
- `FOLIO_VAULT_EVM_ADDRESS`
- `FOLIO_VAULT_PREVIOUS_CONTRACT_ID` (keep the superseded vault so 30d MAU is not reset)
- `FOLIO_VAULT_PREVIOUS_EVM_ADDRESS`
- `FOLIO_VAULT_CUTOVER_DATE` (shown on the landing notice)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HEDERA_NETWORK` (`mainnet` or `testnet`)
- `USDC_TOKEN_ID`
- `HEDERA_OPERATOR_ID` (optional, labels operator rows)

The dashboard unions successful user `deposit()` CONTRACTCALLs across **both** vaults. Qualified MAU = unique wallets with ≥2 deposits in 30 days. Single-deposit wallets are shown separately.

Do not expose this on a public URL without auth — the service role can read the user table.
