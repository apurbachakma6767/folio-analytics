import { getMirrorBase } from './env';

const FETCH_INIT: RequestInit = { next: { revalidate: 60 } };

async function mirrorGet<T>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${getMirrorBase()}${path}`;
  const res = await fetch(url, FETCH_INIT);
  if (!res.ok) throw new Error(`Mirror ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export interface MirrorContractResult {
  from?: string;
  to?: string;
  timestamp?: string;
  function_parameters?: string;
  error_message?: string | null;
  hash?: string;
  result?: string | null;
  transaction_id?: string;
}

export interface MirrorTx {
  transaction_id: string;
  consensus_timestamp: string;
  name: string;
  result: string;
  transfers?: Array<{ account: string; amount: number }>;
  token_transfers?: Array<{ token_id: string; account: string; amount: number }>;
}

interface Page<T> {
  links?: { next?: string | null };
  results?: T[];
  transactions?: T[];
  tokens?: T[];
}

export async function fetchAllContractResults(
  contractId: string,
  sinceSec: number,
  maxPages = 40
): Promise<MirrorContractResult[]> {
  const out: MirrorContractResult[] = [];
  let url: string | null =
    `/api/v1/contracts/${contractId}/results?limit=100&order=desc&timestamp=gte:${sinceSec}`;
  let pages = 0;
  while (url && pages < maxPages) {
    pages++;
    const data: Page<MirrorContractResult> = await mirrorGet(url);
    out.push(...(data.results || []));
    url = data.links?.next || null;
  }
  return out;
}

export async function fetchAccountTransactions(
  accountId: string,
  sinceSec: number,
  maxPages = 40
): Promise<MirrorTx[]> {
  const out: MirrorTx[] = [];
  let url: string | null =
    `/api/v1/transactions?account.id=${accountId}&limit=100&order=desc&timestamp=gte:${sinceSec}`;
  let pages = 0;
  while (url && pages < maxPages) {
    pages++;
    const data: Page<MirrorTx> = await mirrorGet(url);
    out.push(...(data.transactions || []));
    url = data.links?.next || null;
  }
  return out;
}

export async function fetchTransaction(txId: string): Promise<MirrorTx | null> {
  if (!txId) return null;
  const normalized = txId.replace('@', '-').replace(/\.(\d+)$/, '-$1');
  try {
    const data = await mirrorGet<{ transactions?: MirrorTx[] }>(
      `/api/v1/transactions/${encodeURIComponent(normalized)}`
    );
    return data.transactions?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchAccountTokens(
  accountId: string
): Promise<Array<{ token_id: string; balance: number }>> {
  const out: Array<{ token_id: string; balance: number }> = [];
  let url: string | null = `/api/v1/accounts/${accountId}/tokens?limit=100`;
  let pages = 0;
  while (url && pages < 10) {
    pages++;
    const data: Page<{ token_id: string; balance: number }> = await mirrorGet(url);
    out.push(...(data.tokens || []));
    url = data.links?.next || null;
  }
  return out;
}
