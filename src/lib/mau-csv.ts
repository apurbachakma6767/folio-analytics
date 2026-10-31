import { getHashscanBase, hashscanTx } from './env';
import { loadDepositAttempts, loadWalletEmails } from './db';
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

export async function mauDiscardedCsv(): Promise<string> {
  const mau = await getMauSource();
  return toCsv(
    ['method', 'hedera_account_id', 'exclusion_reason', 'at_utc', 'explorer_url'],
    mau.dropped.map((row) => ({
      method: row.method,
      hedera_account_id: row.key,
      exclusion_reason: 'repeat call',
      at_utc: new Date(row.t).toISOString(),
      explorer_url: explorer(row),
    }))
  );
}

export async function mauUsersCsv(): Promise<string> {
  const [mau, emails] = await Promise.all([getMauSource(), loadWalletEmails()]);
  const wallets = [...new Set([...mau.kept, ...mau.dropped].map((r) => r.key))].sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true })
  );
  return toCsv(
    ['email', 'hedera_account_id'],
    wallets.map((accountId) => ({
      email: emails.get(accountId) || '',
      hedera_account_id: accountId,
    }))
  );
}

export async function depositAttemptsCsv(): Promise<string> {
  const rows = (await loadDepositAttempts()).filter((row) => row.status === 'FAILED');
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
