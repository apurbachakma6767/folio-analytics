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

- `FOLIO_VAULT_CONTRACT_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HEDERA_NETWORK` (`mainnet` or `testnet`)
- `USDC_TOKEN_ID`
- `HEDERA_OPERATOR_ID` (optional, labels operator rows)

Do not expose this on a public URL without auth — the service role can read the user table.
