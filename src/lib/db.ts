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
    .select('email,name,hedera_account_id,created_at,is_simulation')
    .neq('hedera_account_id', '');
  if (error) throw error;
  return (data || [])
    .filter((u) => typeof u.hedera_account_id === 'string' && u.hedera_account_id.startsWith('0.0.'))
    .map((u) => ({
      email: String(u.email || '').toLowerCase(),
      name: String(u.name || ''),
      accountId: String(u.hedera_account_id),
      evm: accountToEvm(String(u.hedera_account_id)),
      isSimulation: u.is_simulation === true,
      createdAt: String(u.created_at || ''),
    }));
}

export async function loadUserCounts(): Promise<{ total: number; simulation: number }> {
  const sb = getSupabase();
  const { count: total, error: e1 } = await sb.from('users').select('email', { count: 'exact', head: true });
  if (e1) throw e1;
  const { count: simulation, error: e2 } = await sb
    .from('users')
    .select('email', { count: 'exact', head: true })
    .eq('is_simulation', true);
  if (e2) throw e2;
  return { total: total ?? 0, simulation: simulation ?? 0 };
}

export async function loadSpendNotes(): Promise<SpendRow[]> {
  const { data, error } = await getSupabase()
    .from('spend_notes')
    .select(
      'id,symbol,amount,shares,status,tx_id,settlement_tx_id,user_account_id,recipient,created_at,settled_at,expiry_date'
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
    recipient: String(r.recipient || ''),
    createdAt: String(r.created_at || ''),
    settledAt: r.settled_at ? String(r.settled_at) : null,
    expiryDate: String(r.expiry_date || ''),
  }));
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
