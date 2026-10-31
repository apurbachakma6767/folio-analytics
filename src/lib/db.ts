import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EquityToken, SpendRow, WalletUser } from './types';
import { accountToEvm } from './env';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function loadWallets(): Promise<WalletUser[]> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('hedera_account_id,created_at')
    .neq('hedera_account_id', '');
  if (error) throw error;
  return (data || [])
    .filter((u) => typeof u.hedera_account_id === 'string' && u.hedera_account_id.startsWith('0.0.'))
    .map((u) => ({
      accountId: String(u.hedera_account_id),
      evm: accountToEvm(String(u.hedera_account_id)),
      createdAt: String(u.created_at || ''),
    }));
}

export async function loadWalletEmails(): Promise<Map<string, string>> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('email,hedera_account_id')
    .neq('hedera_account_id', '');
  if (error) throw error;
  const out = new Map<string, string>();
  for (const u of data || []) {
    const accountId = String(u.hedera_account_id || '');
    if (!accountId.startsWith('0.0.')) continue;
    out.set(accountId, String(u.email || '').toLowerCase());
  }
  return out;
}

export async function loadUserCounts(): Promise<{ total: number }> {
  const { count: total, error } = await getSupabase()
    .from('users')
    .select('hedera_account_id', { count: 'exact', head: true });
  if (error) throw error;
  return { total: total ?? 0 };
}

export async function loadSpendNotes(): Promise<SpendRow[]> {
  const { data, error } = await getSupabase()
    .from('spend_notes')
    .select(
      'id,symbol,amount,shares,status,tx_id,settlement_tx_id,user_account_id,created_at,settled_at,expiry_date'
    )
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: Number(r.id),
    symbol: String(r.symbol || ''),
    amount: Number(r.amount || 0),
    shares: Number(r.shares || 0),
    status: String(r.status || ''),
    txId: String(r.tx_id || ''),
    settlementTxId: r.settlement_tx_id ? String(r.settlement_tx_id) : null,
    userAccountId: String(r.user_account_id || ''),
    createdAt: String(r.created_at || ''),
    settledAt: r.settled_at ? String(r.settled_at) : null,
    expiryDate: String(r.expiry_date || ''),
  }));
}

export type DepositAttemptRow = {
  status: string;
  walletId: string;
  at: string;
  failureReason: string;
  eventId: string;
};

export async function loadDepositAttempts(): Promise<DepositAttemptRow[]> {
  const out: DepositAttemptRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase()
      .from('deposit_attempts')
      .select('status,wallet_id,event_timestamp,failure_reason,event_id')
      .order('event_timestamp', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      out.push({
        status: String(r.status || ''),
        walletId: String(r.wallet_id || ''),
        at: String(r.event_timestamp || ''),
        failureReason: String(r.failure_reason || ''),
        eventId: String(r.event_id || ''),
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadEquityTokens(): Promise<EquityToken[]> {
  const { data, error } = await getSupabase()
    .from('folio_equity_tokens')
    .select('symbol,name,token_id,decimals');
  if (error) throw error;
  return (data || []).map((r) => ({
    symbol: String(r.symbol || ''),
    name: String(r.name || r.symbol || ''),
    tokenId: String(r.token_id || ''),
    decimals: Number(r.decimals ?? 6),
  }));
}
