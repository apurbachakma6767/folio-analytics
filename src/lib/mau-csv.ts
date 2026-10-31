import { getHashscanBase, hashscanTx } from './env';
import { loadDepositAttempts, loadWalletEmails, loadWallets } from './db';
import { getMauSource, type MauCall } from './data';

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

function explorer(row: MauCall): string {
  return hashscanTx(row.transactionId, row.timestamp) || `${getHashscanBase()}/transaction/${row.timestamp}`;
}

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  });
}

function sameMethodReason(gapS: number): string {
  if (gapS >= 230 && gapS <= 290) return 'same-method 230-290s';
  if (gapS >= 450 && gapS <= 540) return 'same-method 450-540s';
  return 'same-method gap';
}

export async function mauDiscardedCsv(): Promise<string> {
  const mau = await getMauSource();
  return toCsv(
    ['method', 'hedera_account_id', 'exclusion_reason', 'at_utc', 'explorer_url'],
    mau.dropped.map((row) => ({
      method: row.method,
      hedera_account_id: row.key,
      exclusion_reason: sameMethodReason(row.gapS),
      at_utc: new Date(row.t).toISOString(),
      explorer_url: explorer(row),
    }))
  );
}

export async function mauUsersCsv(): Promise<string> {
  const emails = await loadWalletEmails();
  const wallets = [...emails.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return toCsv(
    ['email', 'hedera_account_id'],
    wallets.map((accountId) => ({
      email: emails.get(accountId) || '',
      hedera_account_id: accountId,
    }))
  );
}

export async function depositAttemptsCsv(): Promise<string> {
  const [attempts, wallets] = await Promise.all([loadDepositAttempts(), loadWallets()]);
  const createdMs = new Map(wallets.map((w) => [w.accountId, Date.parse(w.createdAt)]));
  const rows = attempts.filter((row) => {
    if (row.status !== 'FAILED') return false;
    const born = createdMs.get(row.walletId);
    const at = Date.parse(row.at);
    return Number.isFinite(born) && Number.isFinite(at) && (born as number) <= at;
  });
  return toCsv(
    ['status', 'hedera_account_id', 'at_utc', 'failure_reason'],
    rows.map((row) => ({
      status: row.status,
      hedera_account_id: row.walletId,
      at_utc: row.at,
      failure_reason: row.failureReason,
    }))
  );
}

export async function mauIncludedCsv(): Promise<string> {
  const mau = await getMauSource();
  return toCsv(
    ['method', 'hedera_account_id', 'at_utc', 'explorer_url'],
    mau.kept.map((row) => ({
      method: row.method,
      hedera_account_id: row.key,
      at_utc: new Date(row.t).toISOString(),
      explorer_url: explorer(row),
    }))
  );
}
