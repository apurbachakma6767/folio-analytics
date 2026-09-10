export type TxKind = 'contract' | 'spend' | 'repay' | 'collateral';

export type TxTab = 'all' | TxKind;

export interface WalletUser {
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
  vaultId: string | null;
  vaultRole: 'live' | 'previous' | null;
  user: { accountId: string } | null;
  symbol: string | null;
  amountLabel: string | null;
  explorerUrl: string;
}

export interface DayPoint {
  day: string;
  value: number;
}

export interface VaultBook {
  id: string;
  evm: string;
  explorer: string;
  role: 'live' | 'previous';
  deposits30: number;
  uniqueDepositors30: number;
  releasesSuccess30: number;
  releasesFailed30: number;
}

export interface DashboardData {
  network: 'testnet' | 'mainnet';
  vaultId: string;
  vaultEvm: string;
  vaultExplorer: string;
  previousVaultId: string | null;
  vaults: VaultBook[];
  cutoverDate: string | null;
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
    onChainRepayTxs: number;
    solidityReleaseSuccess30: number;
  };
  mau: {
    d7: number;
    d14: number;
    d30: number;
    /** Unique wallets with ≥2 successful user vault deposit() calls in 30d (both vaults). */
    qualified30: number;
    /** Unique wallets with exactly one successful user deposit() in 30d. */
    single30: number;
    series: DayPoint[];
  };
  window: {
    start: string;
    end: string;
    days: number;
  };
  spendBands: Array<{ label: string; count: number; pct: number }>;
  spendSeries: DayPoint[];
  repaySeries: DayPoint[];
  repayChainSeries: DayPoint[];
  collateral: CollateralSlice[];
  txs: ClassifiedTx[];
  counts: Record<TxTab, number>;
}

export const DEPOSIT_SELECTOR = '47e7ef24';
/** FolioCollateralVault.release(address,address,uint256) */
export const RELEASE_SELECTOR = '8bfb07c9';
