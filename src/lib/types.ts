export type TxKind = 'contract' | 'spend' | 'repay' | 'collateral';

export type TxTab = 'all' | TxKind;

export interface WalletUser {
  email: string;
  name: string;
  accountId: string;
  evm: string;
  createdAt: string;
}

export interface EquityToken {
  symbol: string;
  name: string;
  tokenId: string;
  decimals: number;
}

export interface CollateralSlice {
  symbol: string;
  tokenId: string;
  raw: number;
  shares: number;
}

export interface SpendRow {
  id: number;
  symbol: string;
  amount: number;
  shares: number;
  status: string;
  txId: string;
  settlementTxId: string | null;
  userAccountId: string;
  recipient: string;
  createdAt: string;
  settledAt: string | null;
  expiryDate: string;
}

export interface ClassifiedTx {
  id: string;
  consensus: string;
  at: string;
  name: string;
  result: string;
  kinds: TxKind[];
  method: string | null;
  user: { email: string; name: string; accountId: string } | null;
  symbol: string | null;
  amountLabel: string | null;
  explorerUrl: string;
}

export interface DayPoint {
  day: string;
  value: number;
}

export interface DashboardData {
  network: 'testnet' | 'mainnet';
  vaultId: string;
  vaultEvm: string;
  vaultExplorer: string;
  fetchedAt: string;
  users: {
    total: number;
    withWallet: number;
  };
  notes: {
    active: number;
    repaid: number;
    outstandingUsdc: number;
    advancedUsdc: number;
  };
  mau: {
    d7: number;
    d14: number;
    d30: number;
    series: DayPoint[];
  };
  spendSeries: DayPoint[];
  repaySeries: DayPoint[];
  collateral: CollateralSlice[];
  txs: ClassifiedTx[];
  counts: Record<TxTab, number>;
}

export const DEPOSIT_SELECTOR = '47e7ef24';
export const RELEASE_SELECTOR = '07b67758';
