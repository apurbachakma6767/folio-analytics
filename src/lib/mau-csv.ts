import {
  accountToEvm,
  getAllVaults,
  getHashscanBase,
  getOperatorId,
  hashscanTx,
} from './env';
import { getSupabase } from './db';
import { fetchAllContractResults, type MirrorContractResult } from './mirror';
import { DEPOSIT_SELECTOR, RELEASE_SELECTOR } from './types';

const WINDOW_DAYS = 30;
const BAND1_LO = 230;
const BAND1_HI = 290;
const BAND2_LO = 450;
const BAND2_HI = 540;
const OPERATOR_ECDSA = '0x9e65596dd75950f9ab3a28fdd811d4300f8e5164';

type Call = {
  key: string;
  t: number;
  day: string;
  vaultId: string;
  method: 'deposit' | 'release';
  from: string;
  to: string;
  tokenId: string;
  amountHts: string;
  timestamp: string;
  hash: string;
  transactionId: string;
};

type WalletRow = {
  email: string;
  name: string;
  accountId: string;
  evm: string;
  createdAt: string;
};

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

function tsToIso(ts: string): string {
  const sec = Number(String(ts).split('.')[0]);
  if (!Number.isFinite(sec)) return new Date().toISOString();
  return new Date(sec * 1000).toISOString();
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function selectorOf(params?: string | null): string {
  return (params || '').replace(/^0x/i, '').toLowerCase().slice(0, 8);
}

function longZeroAccount(hex40: string): string | null {
  const hex = hex40.replace(/^0x/i, '').toLowerCase();
  if (hex.length !== 40) return null;
  const n = parseInt(hex, 16);
  return Number.isFinite(n) && n < 2 ** 32 ? `0.0.${n}` : null;
}

function decodeWord(params: string, wordIndex: number): string {
  const hex = params.replace(/^0x/i, '').toLowerCase();
  return hex.slice(8 + wordIndex * 64, 8 + (wordIndex + 1) * 64);
}

function decodeReleaseTo(params?: string | null): string | null {
  const hex = (params || '').replace(/^0x/i, '').toLowerCase();
  if (hex.slice(0, 8) !== RELEASE_SELECTOR || hex.length < 8 + 128) return null;
  return `0x${hex.slice(8 + 64, 8 + 128).slice(24)}`;
}

function isTimedGap(gapS: number | null): boolean {
  if (gapS == null) return false;
  return (gapS >= BAND1_LO && gapS <= BAND1_HI) || (gapS >= BAND2_LO && gapS <= BAND2_HI);
}

function bandOf(gapS: number): string {
  if (gapS >= BAND1_LO && gapS <= BAND1_HI) return `${BAND1_LO}-${BAND1_HI}`;
  if (gapS >= BAND2_LO && gapS <= BAND2_HI) return `${BAND2_LO}-${BAND2_HI}`;
  return '';
}

function partitionPaced(rows: Call[]): { kept: Call[]; dropped: Array<Call & { gapS: number }> } {
  const sorted = [...rows].sort((a, b) => a.t - b.t || a.key.localeCompare(b.key));
  const kept: Call[] = [];
  const dropped: Array<Call & { gapS: number }> = [];
  let prev: number | null = null;
  for (const row of sorted) {
    const gap = prev == null ? null : Math.round((row.t - prev) / 1000);
    prev = row.t;
    if (isTimedGap(gap)) dropped.push({ ...row, gapS: gap! });
    else kept.push(row);
  }
  return { kept, dropped };
}

async function loadMappedWallets(): Promise<WalletRow[]> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('email,name,hedera_account_id,evm_wallet_address,created_at')
    .neq('hedera_account_id', '');
  if (error) throw error;
  return (data || [])
    .filter((u) => String(u.hedera_account_id || '').startsWith('0.0.'))
    .map((u) => {
      const accountId = String(u.hedera_account_id);
      const stored = String(u.evm_wallet_address || '').toLowerCase();
      return {
        email: String(u.email || '').toLowerCase(),
        name: String(u.name || ''),
        accountId,
        evm: stored.startsWith('0x') ? stored : accountToEvm(accountId),
        createdAt: String(u.created_at || ''),
      };
    });
}

export async function buildMauCsvs(): Promise<{
  discarded: string;
  users: string;
  included: string;
  snapshotUtc: string;
  discardedCount: number;
  includedCount: number;
  userCount: number;
  qualified30: number;
}> {
  const snapshotUtc = new Date().toISOString();
  const vaults = getAllVaults();
  const vaultEvms = new Set(vaults.map((v) => v.evm.toLowerCase()));
  const operatorId = getOperatorId();
  const operatorEvm = operatorId ? accountToEvm(operatorId).toLowerCase() : '';
  const exclude = new Set<string>([...vaultEvms, OPERATOR_ECDSA]);
  if (operatorEvm) exclude.add(operatorEvm);

  const wallets = await loadMappedWallets();
  const byAccount = new Map(wallets.map((w) => [w.accountId, w]));
  const byEvm = new Map<string, WalletRow>();
  for (const w of wallets) {
    byEvm.set(w.evm.toLowerCase(), w);
    byEvm.set(accountToEvm(w.accountId).toLowerCase(), w);
  }

  function callerKey(raw: string): string | null {
    const f = (raw || '').toLowerCase();
    if (!f) return null;
    const evm = f.startsWith('0x') ? f : `0x${f}`;
    if (exclude.has(evm)) return null;
    return byEvm.get(evm)?.accountId || longZeroAccount(evm) || evm;
  }

  const since = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400;
  const cutoff30 = Date.now() - WINDOW_DAYS * 86400_000;
  const results: Array<MirrorContractResult & { vaultId: string }> = [];
  for (const v of vaults) {
    const rows = await fetchAllContractResults(v.id, since, 80);
    for (const cr of rows) results.push({ ...cr, vaultId: v.id });
  }

  const deposits: Call[] = [];
  const releases: Call[] = [];
  for (const cr of results) {
    if (cr.error_message) continue;
    const sel = selectorOf(cr.function_parameters);
    const t = new Date(tsToIso(cr.timestamp || '')).getTime();
    if (t < cutoff30) continue;
    const iso = tsToIso(cr.timestamp || '');
    const tokenWord = decodeWord(cr.function_parameters || '', 0);
    const tokenId = longZeroAccount(`0x${tokenWord.slice(24)}`) || '';
    const base = {
      t,
      day: dayKey(iso),
      vaultId: cr.vaultId,
      from: (cr.from || '').toLowerCase(),
      tokenId,
      timestamp: cr.timestamp || '',
      hash: cr.hash || '',
      transactionId: cr.transaction_id || '',
    };
    if (sel === DEPOSIT_SELECTOR) {
      const key = callerKey(cr.from || '');
      if (!key) continue;
      const amt = decodeWord(cr.function_parameters || '', 1);
      deposits.push({
        ...base,
        key,
        method: 'deposit',
        to: '',
        amountHts: amt ? String(BigInt('0x' + amt)) : '',
      });
    } else if (sel === RELEASE_SELECTOR) {
      const to = decodeReleaseTo(cr.function_parameters);
      const key = to ? callerKey(to) : null;
      if (!key) continue;
      const amt = decodeWord(cr.function_parameters || '', 2);
      releases.push({
        ...base,
        key,
        method: 'release',
        to: to || '',
        amountHts: amt ? String(BigInt('0x' + amt)) : '',
      });
    }
  }

  const depPart = partitionPaced(deposits);
  const relPart = partitionPaced(releases);
  const kept = [...depPart.kept, ...relPart.kept].sort((a, b) => a.t - b.t);
  const dropped = [...depPart.dropped, ...relPart.dropped].sort((a, b) => a.t - b.t);

  const counts = new Map<string, number>();
  const discardedCounts = new Map<string, number>();
  const firstKept = new Map<string, number>();
  const lastKept = new Map<string, number>();
  for (const row of kept) {
    counts.set(row.key, (counts.get(row.key) || 0) + 1);
    firstKept.set(row.key, Math.min(firstKept.get(row.key) ?? row.t, row.t));
    lastKept.set(row.key, Math.max(lastKept.get(row.key) ?? row.t, row.t));
  }
  for (const row of dropped) {
    discardedCounts.set(row.key, (discardedCounts.get(row.key) || 0) + 1);
  }

  const explorer = (row: Call) =>
    hashscanTx(row.transactionId, row.timestamp) || `${getHashscanBase()}/transaction/${row.timestamp}`;

  const includedRows = kept.map((row, i) => {
    const w = byAccount.get(row.key);
    return {
      snapshot_utc: snapshotUtc,
      n: i + 1,
      method: row.method,
      hedera_account_id: row.key,
      email: w?.email || '',
      name: w?.name || '',
      evm: w?.evm || '',
      vault_contract_id: row.vaultId,
      token_id: row.tokenId,
      amount_hts: row.amountHts,
      consensus_timestamp: row.timestamp,
      consensus_at_utc: new Date(row.t).toISOString(),
      transaction_id: row.transactionId,
      result_hash: row.hash,
      explorer_url: explorer(row),
      remaining_call_n: '',
    };
  });
  const byWallet = new Map<string, number>();
  for (const row of includedRows) {
    const n = (byWallet.get(String(row.hedera_account_id)) || 0) + 1;
    byWallet.set(String(row.hedera_account_id), n);
    row.remaining_call_n = n;
  }

  const discardedRows = dropped.map((row) => {
    const w = byAccount.get(row.key);
    return {
      snapshot_utc: snapshotUtc,
      method: row.method,
      hedera_account_id: row.key,
      email: w?.email || '',
      name: w?.name || '',
      evm: w?.evm || '',
      vault_contract_id: row.vaultId,
      token_id: row.tokenId,
      amount_hts: row.amountHts,
      gap_seconds: row.gapS,
      clamp_band: bandOf(row.gapS),
      consensus_timestamp: row.timestamp,
      consensus_at_utc: new Date(row.t).toISOString(),
      transaction_id: row.transactionId,
      result_hash: row.hash,
      explorer_url: explorer(row),
    };
  });

  const keys = new Set<string>([
    ...wallets.map((w) => w.accountId),
    ...counts.keys(),
    ...discardedCounts.keys(),
  ]);
  const userRows = [...keys]
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((accountId) => {
      const w = byAccount.get(accountId);
      const remaining = counts.get(accountId) || 0;
      return {
        snapshot_utc: snapshotUtc,
        email: w?.email || '',
        name: w?.name || '',
        hedera_account_id: accountId,
        evm_address: w?.evm || accountToEvm(accountId),
        registered_at_utc: w?.createdAt || '',
        remaining_calls_30d: remaining,
        discarded_paced_calls_30d: discardedCounts.get(accountId) || 0,
        qualifies_ge2: remaining >= 2 ? 'yes' : 'no',
        first_remaining_utc: firstKept.has(accountId)
          ? new Date(firstKept.get(accountId)!).toISOString()
          : '',
        last_remaining_utc: lastKept.has(accountId)
          ? new Date(lastKept.get(accountId)!).toISOString()
          : '',
      };
    });

  return {
    discarded: toCsv(
      [
        'snapshot_utc',
        'method',
        'hedera_account_id',
        'email',
        'name',
        'evm',
        'vault_contract_id',
        'token_id',
        'amount_hts',
        'gap_seconds',
        'clamp_band',
        'consensus_timestamp',
        'consensus_at_utc',
        'transaction_id',
        'result_hash',
        'explorer_url',
      ],
      discardedRows
    ),
    users: toCsv(
      [
        'snapshot_utc',
        'email',
        'name',
        'hedera_account_id',
        'evm_address',
        'registered_at_utc',
        'remaining_calls_30d',
        'discarded_paced_calls_30d',
        'qualifies_ge2',
        'first_remaining_utc',
        'last_remaining_utc',
      ],
      userRows
    ),
    included: toCsv(
      [
        'snapshot_utc',
        'n',
        'method',
        'hedera_account_id',
        'email',
        'name',
        'evm',
        'vault_contract_id',
        'token_id',
        'amount_hts',
        'consensus_timestamp',
        'consensus_at_utc',
        'transaction_id',
        'result_hash',
        'explorer_url',
        'remaining_call_n',
      ],
      includedRows
    ),
    snapshotUtc,
    discardedCount: discardedRows.length,
    includedCount: includedRows.length,
    userCount: userRows.length,
    qualified30: userRows.filter((r) => r.qualifies_ge2 === 'yes').length,
  };
}
