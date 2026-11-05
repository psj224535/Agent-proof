import type {Identity, Verdict} from '../shared-schemas/types.ts';

export type Hex = `0x${string}`;
export type TestChainId = 31337 | 11155111;
/** All asset quantities and monetary values are canonical decimal integer strings. */
export interface OnchainTradeIntent {
  version: 'agentproof-trade-v1'; chainId: TestChainId; exchangeContract: string;
  buyerWallet: string; agentIdentity: Identity; executionWallet: string;
  action: 'BUY'; token: string; quantity: string; maxTotalCostWei: string;
  merchant: string; purpose: 'payment'; createdAt: string; expiresAt: string; nonce: string;
}
export interface TradeAuthorizationPolicy {
  policyVersion: string; userWallet: string; agentIdentity: Identity; executionWallet: string;
  allowedExchange: string; allowedChainId: TestChainId; allowedTokens: string[];
  buyEnabled: boolean; maxPerTradeWei: string; autoApproveLimitWei: string;
  totalBudgetWei: string; spentWei: string; validFrom: string; expiresAt: string;
  active: boolean; revoked: boolean; policyHash: string;
}
export interface AuthorizationDecision {
  verdict: 'ALLOW' | 'ASK' | 'DENY'; reasonCodes: string[];
  policyHash?: string; actionHash?: string; remainingBudgetWei?: string;
}
/** chainId and exchange are bound by the EIP-712 domain, not duplicated here. */
export interface ExecutionAuthorization {
  registry: string; agentId: string; agentOwner: string; executionWallet: string; buyer: string;
  token: string; quantity: string; maxTotalCostWei: string; policyVersion: string;
  evidenceHash: string; traceId: string; nonce: string; issuedAt: string; expiresAt: string;
}
export interface ExchangeListing {
  token: string; name: string; symbol: string; decimals: number;
  pricePerWholeTokenWei: string; inventory: string; active: boolean; demoScore: number;
  updatedAt: string; blockNumber?: string;
}
export interface WalletBalanceSnapshot {
  wallet: string; token: string; tokenBalance: string; depositedBudgetWei: string;
  gasBalanceWei?: string; blockNumber: string; blockHash: string;
}
export interface TransactionEvidence {
  transactionHash: string; blockNumber: string; blockHash: string; gasUsed: string;
  status: 'success'; eventName: 'VerifiedAgentPurchase'; event: Record<string, string>;
}
export interface ExecutionRecord {
  traceId: string; intent: OnchainTradeIntent; status: 'PREPARED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  authentication?: {verdict: Verdict; expiresAt?: string; traceId?: string};
  authorization?: AuthorizationDecision; transaction?: TransactionEvidence;
  before?: WalletBalanceSnapshot; after?: WalletBalanceSnapshot; reasonCodes?: string[];
}
export interface AuthenticationState {verdict: Verdict; expiresAt: string; evidenceHash?: string}
export interface HumanApproval {authorization: ExecutionAuthorization; signature: string}
