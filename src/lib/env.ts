export type HederaNetwork = 'testnet' | 'mainnet';

export function getNetwork(): HederaNetwork {
  return process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
}

export function getMirrorBase(): string {
  if (process.env.HEDERA_MIRROR_NODE_URL) {
    return process.env.HEDERA_MIRROR_NODE_URL.replace(/\/$/, '');
  }
  return getNetwork() === 'mainnet'
    ? 'https://mainnet-public.mirrornode.hedera.com'
    : 'https://testnet.mirrornode.hedera.com';
}

export function getHashscanBase(): string {
  if (process.env.NEXT_PUBLIC_HASHSCAN_BASE) {
    return process.env.NEXT_PUBLIC_HASHSCAN_BASE.replace(/\/$/, '');
  }
  return getNetwork() === 'mainnet'
    ? 'https://hashscan.io/mainnet'
    : 'https://hashscan.io/testnet';
}

export function getVaultId(): string {
  const id = process.env.FOLIO_VAULT_CONTRACT_ID?.trim();
  if (!id) throw new Error('FOLIO_VAULT_CONTRACT_ID is required');
  return id;
}

export function getVaultEvm(): string {
  return (process.env.FOLIO_VAULT_EVM_ADDRESS || accountToEvm(getVaultId())).toLowerCase();
}

export function getOperatorId(): string {
  return (process.env.HEDERA_OPERATOR_ID || '').trim();
}

export function getUsdcTokenId(): string {
  return (process.env.USDC_TOKEN_ID || process.env.USDC_TEST_TOKEN_ID || '').trim();
}

/** Hedera `0.0.N` → 20-byte EVM address (account-num encoding). */
export function accountToEvm(accountId: string): string {
  const parts = accountId.trim().split('.');
  const num = BigInt(parts[2] || '0');
  return '0x' + num.toString(16).padStart(40, '0');
}

export function evmToAccount(evm: string): string {
  const hex = evm.replace(/^0x/i, '');
  return `0.0.${parseInt(hex, 16)}`;
}

export function hashscanTx(txId: string, consensus?: string): string {
  const base = getHashscanBase();
  if (consensus) return `${base}/transaction/${consensus}`;
  const normalized = txId.replace('@', '-').replace(/\.(\d+)$/, '-$1');
  return `${base}/transaction/${normalized}`;
}

export function hashscanAccount(id: string): string {
  return `${getHashscanBase()}/account/${id}`;
}

export function hashscanContract(id: string): string {
  return `${getHashscanBase()}/contract/${id}`;
}

export function hashscanToken(id: string): string {
  return `${getHashscanBase()}/token/${id}`;
}
