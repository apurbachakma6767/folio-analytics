import {
  getNetwork,
  getUsdcTokenId,
  getVaultEvm,
  getVaultId,
  hashscanContract,
  hashscanTx,
} from './env';
import { loadEquityTokens, loadSpendNotes, loadUserCounts, loadWallets } from './db';
import {
  fetchAccountTokens,
  fetchAccountTransactions,
  fetchAllContractResults,
  fetchTransaction,
  type MirrorContractResult,
  type MirrorTx,
} from './mirror';
import {
  DEPOSIT_SELECTOR,
  type ClassifiedTx,
  type CollateralSlice,
  type DashboardData,
  type DayPoint,
  type TxKind,
  type WalletUser,
} from './types';

const WINDOW_DAYS = 30;

function daysAgoSec(n: number): number {
  return Math.floor(Date.now() / 1000) - n * 86400;
}

function tsToIso(ts: string): string {
  const sec = Number(String(ts).split('.')[0]);
  if (!Number.isFinite(sec)) return new Date().toISOString();
  return new Date(sec * 1000).toISOString();
}

function consensusKey(ts: string, id?: string): string {
  const [s, frac = '0'] = String(ts).split('.');
  return `${s}.${frac.slice(0, 3)}:${id || ''}`;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  // Closed days only — skip UTC today so the last point is not an incomplete day.
  for (let i = n; i >= 1; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function normalizeTxId(id: string): string {
  return id.trim().replace('@', '-').replace(/\.(\d+)$/, '-$1');
}

function selectorOf(params?: string | null): string {
  if (!params) return '';
  const hex = params.replace(/^0x/i, '').toLowerCase();
  return hex.slice(0, 8);
}

function methodLabel(sel: string): string | null {
  if (sel === DEPOSIT_SELECTOR) return 'deposit';
  if (sel === '07b67758' || sel === '1e83409a') return 'release';
  return sel ? `0x${sel}` : null;
}

function fillSeries(days: number, hits: Record<string, number>): DayPoint[] {
  return lastNDays(days).map((day) => ({ day, value: hits[day] || 0 }));
}

export async function loadDashboard(): Promise<DashboardData> {
  const vaultId = getVaultId();
  const vaultEvm = getVaultEvm();
  const usdc = getUsdcTokenId();
  const since = daysAgoSec(WINDOW_DAYS);

  const [wallets, counts, notes, equities, contractResults, vaultTxs, vaultTokens] =
    await Promise.all([
      loadWallets(),
      loadUserCounts(),
      loadSpendNotes(),
      loadEquityTokens(),
      fetchAllContractResults(vaultId, since).catch(() => [] as MirrorContractResult[]),
      fetchAccountTransactions(vaultId, since).catch(() => [] as MirrorTx[]),
      fetchAccountTokens(vaultId).catch(() => [] as Array<{ token_id: string; balance: number }>),
    ]);

  const walletByAccount = new Map(wallets.map((w) => [w.accountId, w]));
  const walletByEvm = new Map(wallets.map((w) => [w.evm.toLowerCase(), w]));
  const equityByToken = new Map(equities.map((e) => [e.tokenId, e]));
  const knownAccounts = new Set(wallets.map((w) => w.accountId));
  knownAccounts.add(vaultId);

  const party = (accountId: string) => ({ accountId });

  const spendByTx = new Map<string, (typeof notes)[number]>();
  const repayByTx = new Map<string, (typeof notes)[number]>();
  for (const n of notes) {
    if (n.txId) spendByTx.set(normalizeTxId(n.txId), n);
    if (n.settlementTxId) repayByTx.set(normalizeTxId(n.settlementTxId), n);
  }

  const missingIds = [...spendByTx.keys(), ...repayByTx.keys()].filter(
    (id) => id && !vaultTxs.some((t) => normalizeTxId(t.transaction_id) === id)
  );
  const extra = (
    await Promise.all(missingIds.slice(0, 80).map((id) => fetchTransaction(id)))
  ).filter((t): t is MirrorTx => Boolean(t));

  const txById = new Map<string, MirrorTx>();
  for (const t of [...vaultTxs, ...extra]) {
    txById.set(normalizeTxId(t.transaction_id), t);
  }

  const classified: ClassifiedTx[] = [];

  function resolveUser(opts: {
    evm?: string;
    accounts?: string[];
    fallbackAccount?: string;
  }): WalletUser | null {
    if (opts.evm) {
      const w = walletByEvm.get(opts.evm.toLowerCase());
      if (w) return w;
      const acct = `0.0.${parseInt(opts.evm.replace(/^0x/i, ''), 16)}`;
      const w2 = walletByAccount.get(acct);
      if (w2) return w2;
    }
    for (const a of opts.accounts || []) {
      if (a === vaultId) continue;
      const w = walletByAccount.get(a);
      if (w) return w;
    }
    if (opts.fallbackAccount) return walletByAccount.get(opts.fallbackAccount) ?? null;
    return null;
  }

  function pushTx(row: ClassifiedTx) {
    const existing = classified.find((t) => {
      if (row.id && t.id && t.id === row.id) return true;
      if (row.consensus && t.consensus) {
        return consensusKey(t.consensus) === consensusKey(row.consensus);
      }
      return false;
    });
    if (existing) {
      existing.kinds = [...new Set([...existing.kinds, ...row.kinds])];
      if (!existing.method && row.method) existing.method = row.method;
      if (!existing.user && row.user) existing.user = row.user;
      if (!existing.symbol && row.symbol) existing.symbol = row.symbol;
      if (!existing.amountLabel && row.amountLabel) existing.amountLabel = row.amountLabel;
      if (row.name === 'CONTRACTCALL') existing.name = 'CONTRACTCALL';
      return;
    }
    classified.push(row);
  }

  for (const cr of contractResults) {
    const sel = selectorOf(cr.function_parameters);
    const method = methodLabel(sel);
    const kinds: TxKind[] = ['contract'];
    if (method === 'deposit') kinds.push('spend');
    if (method === 'release') kinds.push('repay');
    const user = resolveUser({ evm: cr.from });
    const matchedSpend = user
      ? notes.find(
          (n) =>
            n.userAccountId === user.accountId &&
            Math.abs(new Date(n.createdAt).getTime() - new Date(tsToIso(cr.timestamp || '')).getTime()) <
              120_000
        )
      : undefined;
    if (matchedSpend) {
      if (!kinds.includes('spend') && method === 'deposit') kinds.push('spend');
    }
    pushTx({
      id: cr.transaction_id ? normalizeTxId(cr.transaction_id) : cr.hash || cr.timestamp || '',
      consensus: cr.timestamp || '',
      at: tsToIso(cr.timestamp || ''),
      name: 'CONTRACTCALL',
      result: cr.error_message ? 'REVERT' : 'SUCCESS',
      kinds: [...new Set(kinds)],
      method,
      user: user
        ? party(user.accountId)
        : cr.from
          ? party(`0.0.${parseInt(cr.from.replace(/^0x/i, ''), 16)}`)
          : null,
      symbol: matchedSpend?.symbol ?? null,
      amountLabel: matchedSpend ? `$${matchedSpend.amount.toFixed(2)}` : method,
      explorerUrl: hashscanTx(
        cr.transaction_id || '',
        cr.timestamp
      ),
    });
  }

  for (const t of txById.values()) {
    const nid = normalizeTxId(t.transaction_id);
    const kinds: TxKind[] = [];
    const spend = spendByTx.get(nid);
    const repay = repayByTx.get(nid);
    if (spend) kinds.push('spend');
    if (repay) kinds.push('repay');

    const tokens = t.token_transfers || [];
    const equityMoves = tokens.filter((x) => equityByToken.has(x.token_id));
    const involvesVault = tokens.some((x) => x.account === vaultId) || t.name === 'CONTRACTCALL';
    if (equityMoves.length && involvesVault) kinds.push('collateral');
    if (t.name === 'CONTRACTCALL') kinds.push('contract');

    if (kinds.length === 0) {
      const accounts = [
        ...(t.transfers || []).map((x) => x.account),
        ...tokens.map((x) => x.account),
      ];
      const known = accounts.some((a) => a !== vaultId && knownAccounts.has(a));
      if (!known && !involvesVault) continue;
      if (t.name === 'CONTRACTCALL') kinds.push('contract');
      else if (equityMoves.length) kinds.push('collateral');
      else continue;
    }

    const accounts = [
      ...(t.transfers || []).map((x) => x.account),
      ...tokens.map((x) => x.account),
    ];
    const user =
      resolveUser({
        accounts,
        fallbackAccount: spend?.userAccountId || repay?.userAccountId,
      }) || null;

    const eq = equityMoves.find((x) => x.account === vaultId) || equityMoves[0];
    const eqMeta = eq ? equityByToken.get(eq.token_id) : undefined;
    const decimals = eqMeta?.decimals ?? 6;
    const shares = eq ? Math.abs(eq.amount) / 10 ** decimals : 0;
    const note = spend || repay;
    const amountLabel = note
      ? `$${note.amount.toFixed(2)}`
      : eqMeta
        ? `${shares.toFixed(4)} ${eqMeta.symbol}`
        : usdc && tokens.some((x) => x.token_id === usdc)
          ? 'USDC'
          : null;

    pushTx({
      id: nid,
      consensus: t.consensus_timestamp,
      at: tsToIso(t.consensus_timestamp),
      name: t.name,
      result: t.result,
      kinds: [...new Set(kinds)],
      method: t.name === 'CONTRACTCALL' ? 'call' : null,
      user: user
        ? party(user.accountId)
        : note
          ? party(note.userAccountId)
          : null,
      symbol: note?.symbol || eqMeta?.symbol || null,
      amountLabel,
      explorerUrl: hashscanTx(nid, t.consensus_timestamp),
    });
  }

  classified.sort((a, b) => b.at.localeCompare(a.at));

  const mauSets = { d7: new Set<string>(), d14: new Set<string>(), d30: new Set<string>() };
  const mauByDay: Record<string, Set<string>> = {};
  const cutoff7 = Date.now() - 7 * 86400_000;
  const cutoff14 = Date.now() - 14 * 86400_000;
  const cutoff30 = Date.now() - 30 * 86400_000;

  for (const cr of contractResults) {
    if (cr.error_message) continue;
    const from = (cr.from || '').toLowerCase();
    if (!from || from === vaultEvm) continue;
    const user = walletByEvm.get(from);
    const key = user?.accountId || from;
    const t = new Date(tsToIso(cr.timestamp || '')).getTime();
    if (t >= cutoff30) mauSets.d30.add(key);
    if (t >= cutoff14) mauSets.d14.add(key);
    if (t >= cutoff7) mauSets.d7.add(key);
    const day = dayKey(tsToIso(cr.timestamp || ''));
    if (!mauByDay[day]) mauByDay[day] = new Set();
    mauByDay[day]!.add(key);
  }

  const spendByDay: Record<string, number> = {};
  const repayByDay: Record<string, number> = {};
  for (const n of notes) {
    const spendDay = dayKey(n.createdAt);
    spendByDay[spendDay] = (spendByDay[spendDay] || 0) + n.amount;
    if (n.settledAt || n.status === 'repaid' || n.status === 'settled') {
      const repayDay = dayKey(n.settledAt || n.createdAt);
      repayByDay[repayDay] = (repayByDay[repayDay] || 0) + n.amount;
    }
  }

  const collateral: CollateralSlice[] = vaultTokens
    .map((t) => {
      const eq = equityByToken.get(t.token_id);
      if (!eq || t.balance <= 0) return null;
      return {
        symbol: eq.symbol,
        tokenId: t.token_id,
        raw: t.balance,
        shares: t.balance / 10 ** eq.decimals,
      };
    })
    .filter((x): x is CollateralSlice => Boolean(x))
    .sort((a, b) => b.shares - a.shares);

  const active = notes.filter((n) => n.status === 'active');
  const repaid = notes.filter((n) => n.status === 'repaid' || n.status === 'settled');

  const countsByTab = {
    all: classified.length,
    contract: classified.filter((t) => t.kinds.includes('contract')).length,
    spend: classified.filter((t) => t.kinds.includes('spend')).length,
    repay: classified.filter((t) => t.kinds.includes('repay')).length,
    collateral: classified.filter((t) => t.kinds.includes('collateral')).length,
  };

  return {
    network: getNetwork(),
    vaultId,
    vaultEvm,
    vaultExplorer: hashscanContract(vaultId),
    fetchedAt: new Date().toISOString(),
    users: {
      total: counts.total,
      withWallet: wallets.length,
    },
    notes: {
      active: active.length,
      repaid: repaid.length,
      outstandingUsdc: active.reduce((s, n) => s + n.amount, 0),
      advancedUsdc: notes.reduce((s, n) => s + n.amount, 0),
    },
    mau: {
      d7: mauSets.d7.size,
      d14: mauSets.d14.size,
      d30: mauSets.d30.size,
      series: lastNDays(WINDOW_DAYS).map((day) => ({
        day,
        value: mauByDay[day]?.size ?? 0,
      })),
    },
    spendSeries: fillSeries(WINDOW_DAYS, spendByDay),
    repaySeries: fillSeries(WINDOW_DAYS, repayByDay),
    collateral,
    txs: classified.slice(0, 500),
    counts: countsByTab,
  };
}
