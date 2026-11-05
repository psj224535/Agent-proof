import {validate} from '../shared-schemas/json.ts';
import type {Schema} from '../shared-schemas/json.ts';
import {isIso} from '../crypto/index.ts';
import type {OnchainTradeIntent, TradeAuthorizationPolicy, ExecutionAuthorization} from './types.ts';

// Kept independent of shared-schemas/index: its presentation schema imports this schema.
const obj=(properties:Record<string,Schema>):Schema=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const timeSchema:Schema={type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'};

export const addressSchema: Schema = {type:'string',pattern:'^0x[0-9a-fA-F]{40}$'};
export const uintSchema: Schema = {type:'string',pattern:'^(0|[1-9][0-9]{0,77})$'};
export const bytes32Schema: Schema = {type:'string',pattern:'^0x[0-9a-fA-F]{64}$'};
export const testChainSchema: Schema = {enum:[31337,11155111]};
export const tradeIdentitySchema = obj({chainId:testChainSchema,registry:addressSchema,agentId:uintSchema});
export const onchainTradeIntentSchema = obj({
  version:{const:'agentproof-trade-v1'},chainId:testChainSchema,exchangeContract:addressSchema,
  buyerWallet:addressSchema,agentIdentity:tradeIdentitySchema,executionWallet:addressSchema,
  action:{const:'BUY'},token:addressSchema,quantity:uintSchema,maxTotalCostWei:uintSchema,
  merchant:{type:'string',minLength:1,maxLength:255},purpose:{const:'payment'},createdAt:timeSchema,expiresAt:timeSchema,
  nonce:{type:'string',pattern:'^[0-9a-f]{32}$'}
});
export const tradePolicySchema = obj({
  policyVersion:uintSchema,userWallet:addressSchema,agentIdentity:tradeIdentitySchema,executionWallet:addressSchema,
  allowedExchange:addressSchema,allowedChainId:testChainSchema,
  allowedTokens:{type:'array',items:addressSchema,maxItems:128},buyEnabled:{type:'boolean'},
  maxPerTradeWei:uintSchema,autoApproveLimitWei:uintSchema,totalBudgetWei:uintSchema,spentWei:uintSchema,
  validFrom:timeSchema,expiresAt:timeSchema,active:{type:'boolean'},revoked:{type:'boolean'},policyHash:bytes32Schema
});
export const executionAuthorizationSchema = obj({registry:addressSchema,agentId:uintSchema,agentOwner:addressSchema,
  executionWallet:addressSchema,buyer:addressSchema,token:addressSchema,quantity:uintSchema,maxTotalCostWei:uintSchema,
  policyVersion:uintSchema,evidenceHash:bytes32Schema,traceId:bytes32Schema,nonce:bytes32Schema,issuedAt:uintSchema,expiresAt:uintSchema});

export function uint256(value: string, name='UINT256'): bigint {
  validate(uintSchema,value);const n=BigInt(value);
  if(n>=(1n<<256n))throw new Error(name+'_OUT_OF_RANGE');return n;
}
function positive(value:string,name:string):void {if(uint256(value,name)===0n)throw new Error(name+'_MUST_BE_POSITIVE');}
function validTimes(from:string,to:string):void {if(!isIso(from)||!isIso(to)||Date.parse(to)<=Date.parse(from))throw new Error('INVALID_TIME_RANGE');}
export function validateTradeIntent(value:unknown):OnchainTradeIntent {
  const i=validate<OnchainTradeIntent>(onchainTradeIntentSchema,value);
  for(const key of ['quantity','maxTotalCostWei'] as const)positive(i[key],key.toUpperCase());
  uint256(i.agentIdentity.agentId);validTimes(i.createdAt,i.expiresAt);
  if(i.chainId!==i.agentIdentity.chainId)throw new Error('INTENT_CHAIN_MISMATCH');
  if(Date.parse(i.expiresAt)-Date.parse(i.createdAt)>300_000)throw new Error('INTENT_TTL_EXCEEDED');
  return i;
}
export function validateTradePolicy(value:unknown):TradeAuthorizationPolicy {
  const p=validate<TradeAuthorizationPolicy>(tradePolicySchema,value);
  for(const key of ['policyVersion','maxPerTradeWei','autoApproveLimitWei','totalBudgetWei','spentWei'] as const)uint256(p[key]);
  validTimes(p.validFrom,p.expiresAt);uint256(p.agentIdentity.agentId);
  if(p.allowedChainId!==p.agentIdentity.chainId)throw new Error('POLICY_CHAIN_MISMATCH');
  if(BigInt(p.autoApproveLimitWei)>BigInt(p.maxPerTradeWei))throw new Error('INVALID_AUTO_APPROVE_LIMIT');
  if(BigInt(p.maxPerTradeWei)>BigInt(p.totalBudgetWei)||BigInt(p.maxPerTradeWei)===0n||BigInt(p.policyVersion)===0n)throw new Error('INVALID_POLICY_LIMITS');
  if(new Set(p.allowedTokens.map(t=>t.toLowerCase())).size!==p.allowedTokens.length)throw new Error('DUPLICATE_ALLOWED_TOKEN');
  return p;
}
export function validateExecutionAuthorization(value:unknown):ExecutionAuthorization {
  const a=validate<ExecutionAuthorization>(executionAuthorizationSchema,value);
  for(const key of ['agentId','quantity','maxTotalCostWei','policyVersion','issuedAt','expiresAt'] as const)uint256(a[key]);
  positive(a.quantity,'QUANTITY');positive(a.maxTotalCostWei,'MAX_TOTAL_COST');
  if(BigInt(a.issuedAt)>=(1n<<64n)||BigInt(a.expiresAt)>=(1n<<64n))throw new Error('TIMESTAMP_OUT_OF_RANGE');
  if(BigInt(a.expiresAt)<=BigInt(a.issuedAt)||BigInt(a.expiresAt)-BigInt(a.issuedAt)>120n)throw new Error('AUTHORIZATION_TTL_INVALID');
  for(const key of ['evidenceHash','traceId','nonce'] as const)if(/^0x0{64}$/.test(a[key]))throw new Error('AUTHORIZATION_EVIDENCE_OR_NONCE_MISSING');
  return a;
}
