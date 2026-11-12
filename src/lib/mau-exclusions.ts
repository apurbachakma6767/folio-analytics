import excludedFile from '../../data/mau-excluded-txs.json';
import { getSupabase } from './db';

const ANCHOR_MS = 180_000;

export type ExclusionAnchor = {
  account: string;
  atMs: number;
  reason: string;
};

export type ExclusionIndex = {
  byTx: Map<string, string>;
  anchors: ExclusionAnchor[];
};

type ListedRow = {
  transaction_id: string;
  transaction_id_normalized?: string;
  account?: string;
  at?: string;
  reason?: string;
};

export function normalizeTxId(id: string): string {
  return id.trim().replace('@', '-').replace(/\.(\d+)$/, '-$1').toLowerCase();
}

/** Listed transactions that do not count in MAU. Not a time-band filter. */
export function listedExcludedTxIds(): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of excludedFile.transactions as ListedRow[]) {
    const reason = String(row.reason || 'excluded transaction');
    out.set(normalizeTxId(row.transaction_id), reason);
    if (row.transaction_id_normalized) {
      out.set(normalizeTxId(row.transaction_id_normalized), reason);
    }
  }
  return out;
}

function listedAnchors(): ExclusionAnchor[] {
  const out: ExclusionAnchor[] = [];
  for (const row of excludedFile.transactions as ListedRow[]) {
    const account = String(row.account || '');
    const atMs = Date.parse(String(row.at || ''));
    if (!account || !Number.isFinite(atMs)) continue;
    out.push({
      account,
      atMs,
      reason: String(row.reason || 'excluded transaction'),
    });
  }
  return out;
}

/** Successful deposit attempts on a chain that also has a FAILED attempt. */
export async function loadRetryTxIds(): Promise<{
  byTx: Map<string, string>;
  anchors: ExclusionAnchor[];
}> {
  const sb = getSupabase();
  const rows: Array<{
    status: string;
    event_id: string | null;
    chain_id: string;
    wallet_id: string;
    event_timestamp: string;
  }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('deposit_attempts')
      .select('status,event_id,chain_id,wallet_id,event_timestamp')
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as typeof rows));
    if (data.length < 1000) break;
  }
  const failed = new Set(rows.filter((r) => r.status === 'FAILED').map((r) => r.chain_id));
  const byTx = new Map<string, string>();
  const anchors: ExclusionAnchor[] = [];
  for (const r of rows) {
    if (r.status !== 'SUCCESS' || !failed.has(r.chain_id)) continue;
    const reason = 'excluded transaction';
    if (r.event_id) byTx.set(normalizeTxId(r.event_id), reason);
    const atMs = Date.parse(r.event_timestamp);
    if (r.wallet_id && Number.isFinite(atMs)) {
      anchors.push({ account: r.wallet_id, atMs, reason });
    }
  }
  return { byTx, anchors };
}

export async function loadExcludedTxIds(): Promise<ExclusionIndex> {
  return {
    byTx: listedExcludedTxIds(),
    anchors: listedAnchors(),
  };
}

/** Hedera contract results often omit transaction_id; match listed rows by account + time. */
export function exclusionReasonFor(
  row: { transactionId: string; key: string; t: number },
  index: ExclusionIndex,
  usedAnchors: Set<number>
): string | undefined {
  if (row.transactionId) {
    const byId = index.byTx.get(normalizeTxId(row.transactionId));
    if (byId) return byId;
  }
  let best = -1;
  let bestDt = Infinity;
  for (let i = 0; i < index.anchors.length; i++) {
    if (usedAnchors.has(i)) continue;
    const a = index.anchors[i];
    if (a.account !== row.key) continue;
    const dt = Math.abs(a.atMs - row.t);
    if (dt <= ANCHOR_MS && dt < bestDt) {
      best = i;
      bestDt = dt;
    }
  }
  if (best < 0) return undefined;
  usedAnchors.add(best);
  return index.anchors[best].reason;
}
