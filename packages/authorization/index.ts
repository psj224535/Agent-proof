import type {AuthenticationState,AuthorizationDecision,HumanApproval,OnchainTradeIntent,TradeAuthorizationPolicy} from '../trading/types.ts';
import {uint256,validateTradeIntent,validateTradePolicy} from '../trading/schema.ts';
import {actionHash,policyHash,remainingBudget} from '../trading/intent.ts';
import {assertExecutionMatchesIntent,verifyHumanApproval} from '../trading/eip712.ts';
export interface ProposedAction {merchant:string;productId:string;amount:number;currency:string;quantity:number}
export interface AuthorizationPolicy {version:string;[key:string]:unknown}
export interface LegacyAuthorizationInput {authenticationTicket:string;action:ProposedAction;policy?:AuthorizationPolicy}
export interface TradingAuthorizationInput {
 authentication:AuthenticationState;intent:OnchainTradeIntent;policy?:TradeAuthorizationPolicy;
 currentCostWei:string;depositedBudgetWei:string;now?:number;humanApproval?:HumanApproval;
}
export interface AuthorizationModule {authorize(input:LegacyAuthorizationInput|TradingAuthorizationInput):Promise<AuthorizationDecision>}
/** Not wired to mock access: authentication must never imply a real spending permission. */
export class UnimplementedAuthorization implements AuthorizationModule {
 async authorize():Promise<{verdict:'DENY';reasonCodes:string[]}>{return {verdict:'DENY',reasonCodes:['AUTHORIZATION_NOT_IMPLEMENTED']};}
}

/** A deterministic policy evaluator. Authentication grants no implicit spending power. */
export class RuleBasedAuthorization implements AuthorizationModule {
 async authorize(input:LegacyAuthorizationInput|TradingAuthorizationInput):Promise<AuthorizationDecision> {
  const deny=(reason:string):AuthorizationDecision=>({verdict:'DENY',reasonCodes:[reason]});
  if(!('intent' in input))return deny('LEGACY_PURCHASE_NOT_AUTHORIZED');
  const {authentication,intent,policy:p}=input,now=input.now??Date.now();
  if(authentication.verdict!=='VERIFIED')return deny('AUTHENTICATION_NOT_VERIFIED');
  if(!Number.isFinite(Date.parse(authentication.expiresAt))||Date.parse(authentication.expiresAt)<=now)return deny('AUTHENTICATION_EXPIRED');
  if(!p)return deny('POLICY_MISSING');
  try{validateTradeIntent(intent);validateTradePolicy(p);uint256(input.currentCostWei);uint256(input.depositedBudgetWei);}catch{return deny('TRADE_SCHEMA_INVALID');}
  if(p.policyHash.toLowerCase()!==policyHash(p))return deny('POLICY_HASH_MISMATCH');
  if(p.revoked)return deny('POLICY_REVOKED');if(!p.active)return deny('POLICY_PAUSED');
  if(Date.parse(p.validFrom)>now||Date.parse(p.expiresAt)<=now)return deny('POLICY_EXPIRED_OR_NOT_YET_VALID');
  if(Date.parse(intent.createdAt)>now+30_000||Date.parse(intent.expiresAt)<=now)return deny('INTENT_EXPIRED_OR_NOT_YET_VALID');
  const equal=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
  if(intent.chainId!==p.allowedChainId||intent.agentIdentity.chainId!==p.agentIdentity.chainId)return deny('CHAIN_NOT_ALLOWED');
  if(!equal(intent.exchangeContract,p.allowedExchange))return deny('EXCHANGE_NOT_ALLOWED');
  if(!equal(intent.buyerWallet,p.userWallet))return deny('BUYER_MISMATCH');
  if(!equal(intent.agentIdentity.registry,p.agentIdentity.registry)||intent.agentIdentity.agentId!==p.agentIdentity.agentId)return deny('AGENT_IDENTITY_MISMATCH');
  if(!equal(intent.executionWallet,p.executionWallet))return deny('EXECUTION_WALLET_MISMATCH');
  if(!p.allowedTokens.some(t=>equal(t,intent.token)))return deny('TOKEN_NOT_ALLOWED');
  if(!p.buyEnabled)return deny('BUY_DISABLED');
  const cost=BigInt(input.currentCostWei);if(cost===0n)return deny('ZERO_TRADE_COST');
  if(cost>BigInt(intent.maxTotalCostWei))return deny('MAX_TOTAL_COST_EXCEEDED');
  if(cost>BigInt(p.maxPerTradeWei))return deny('PER_TRADE_LIMIT_EXCEEDED');
  const remaining=remainingBudget(p,input.depositedBudgetWei);
  if(cost>remaining)return deny('BUDGET_EXCEEDED');
  const details={policyHash:p.policyHash,actionHash:actionHash(intent),remainingBudgetWei:String(remaining)};
  if(cost<=BigInt(p.autoApproveLimitWei))return {verdict:'ALLOW',reasonCodes:['WITHIN_AUTO_APPROVAL_LIMIT'],...details};
  if(input.humanApproval){
   const {authorization:a,signature}=input.humanApproval;
   try{
    assertExecutionMatchesIntent(a,intent,p.policyVersion);
    if(BigInt(a.issuedAt)*1000n>BigInt(now)||BigInt(a.expiresAt)*1000n<=BigInt(now)||BigInt(a.expiresAt)*1000n>BigInt(Date.parse(authentication.expiresAt))||BigInt(a.expiresAt)*1000n>BigInt(Date.parse(intent.expiresAt)))return deny('HUMAN_APPROVAL_EXPIRED');
    if(!await verifyHumanApproval(intent.chainId,intent.exchangeContract,a,signature))return deny('HUMAN_APPROVAL_SIGNATURE_INVALID');
   }catch{return deny('HUMAN_APPROVAL_ACTION_MISMATCH');}
   return {verdict:'ALLOW',reasonCodes:['EXACT_ACTION_HUMAN_APPROVED'],...details};
  }
  return {verdict:'ASK',reasonCodes:['HUMAN_APPROVAL_REQUIRED'],...details};
 }
}
