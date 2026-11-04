import {randomHex,sha256} from '../crypto/index.ts';
import {loadViem} from '../erc8004-filter/viem-reader.ts';
import {validate} from '../shared-schemas/json.ts';
import {addressSchema,testChainSchema,validateExecutionAuthorization,validateTradeIntent} from './schema.ts';
import type {AuthenticationState,AuthorizationDecision,ExecutionAuthorization,OnchainTradeIntent,TestChainId} from './types.ts';
import type {EvmKey} from './keys.ts';

export const EXECUTION_WALLET_METADATA_KEY='agentproof.executionWallet.v1';
export const EXECUTION_WALLET_EXTENSION_URI='https://agentproof.example/extensions/execution-wallet/v1';
export const EXECUTION_TYPES={ExecutionAuthorization:[
  {name:'registry',type:'address'},{name:'agentId',type:'uint256'},{name:'agentOwner',type:'address'},
  {name:'executionWallet',type:'address'},{name:'buyer',type:'address'},{name:'token',type:'address'},
  {name:'quantity',type:'uint256'},{name:'maxTotalCostWei',type:'uint256'},{name:'policyVersion',type:'uint256'},
  {name:'evidenceHash',type:'bytes32'},{name:'traceId',type:'bytes32'},{name:'nonce',type:'bytes32'},
  {name:'issuedAt',type:'uint64'},{name:'expiresAt',type:'uint64'}
]};
export const HUMAN_APPROVAL_TYPES={HumanApproval:[{name:'executionHash',type:'bytes32'}]};
export function executionDomain(chainId:TestChainId,exchange:string):any {
  validate(testChainSchema,chainId);validate(addressSchema,exchange);
  return {name:'AgentProofDemoExchange',version:'1',chainId,verifyingContract:exchange};
}
export function executionTypedData(chainId:TestChainId,exchange:string,authorization:ExecutionAuthorization):any {
  return {domain:executionDomain(chainId,exchange),types:EXECUTION_TYPES,primaryType:'ExecutionAuthorization',message:validateExecutionAuthorization(authorization)};
}
export function hashExecution(chainId:TestChainId,exchange:string,authorization:ExecutionAuthorization):string {
  return loadViem().hashTypedData(executionTypedData(chainId,exchange,authorization));
}
export function humanApprovalTypedData(chainId:TestChainId,exchange:string,authorization:ExecutionAuthorization):any {
  return {domain:executionDomain(chainId,exchange),types:HUMAN_APPROVAL_TYPES,primaryType:'HumanApproval',message:{executionHash:hashExecution(chainId,exchange,authorization)}};
}
/** MetaMask JSON includes EIP712Domain while viem itself derives that type. */
export function walletTypedData(data:any):any {
  return {...data,types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],...data.types}};
}
export function executionWalletBinding(address:string):string {
  validate(addressSchema,address);return loadViem().encodeAbiParameters([{type:'address'}],[address]);
}
export function decodeExecutionWalletBinding(bytes:unknown):string {
  if(typeof bytes!=='string'||!/^0x0{24}[0-9a-fA-F]{40}$/.test(bytes))throw new Error('EXECUTION_WALLET_BINDING_INVALID');
  return loadViem().getAddress('0x'+bytes.slice(-40));
}
export const EXECUTION_BINDING_TEST_VECTOR={address:'0x1234567890123456789012345678901234567890',encoded:'0x0000000000000000000000001234567890123456789012345678901234567890'};
export function traceIdBytes32(traceId:string):string {if(typeof traceId!=='string'||!traceId||traceId.length>256)throw new Error('TRACE_ID_INVALID');return '0x'+sha256(traceId);}
const equal=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export function assertExecutionMatchesIntent(auth:ExecutionAuthorization,intent:OnchainTradeIntent,policyVersion:string):void {
  validateExecutionAuthorization(auth);validateTradeIntent(intent);
  if(!equal(auth.registry,intent.agentIdentity.registry)||auth.agentId!==intent.agentIdentity.agentId||!equal(auth.executionWallet,intent.executionWallet)||!equal(auth.buyer,intent.buyerWallet)||!equal(auth.token,intent.token)||auth.quantity!==intent.quantity||auth.maxTotalCostWei!==intent.maxTotalCostWei||auth.policyVersion!==policyVersion)throw new Error('EXECUTION_ACTION_MISMATCH');
}
export function buildExecutionAuthorization(input:{intent:OnchainTradeIntent;agentOwner:string;policyVersion:string;evidenceHash:string;traceId:string;now?:number;authenticationExpiresAt:string;ttlSeconds?:number}):ExecutionAuthorization {
  const now=Math.floor((input.now??Date.now())/1000),i=validateTradeIntent(input.intent);
  const expires=Math.min(now+(input.ttlSeconds??90),Math.floor(Date.parse(input.authenticationExpiresAt)/1000),Math.floor(Date.parse(i.expiresAt)/1000));
  const auth:ExecutionAuthorization={registry:i.agentIdentity.registry,agentId:i.agentIdentity.agentId,agentOwner:input.agentOwner,executionWallet:i.executionWallet,buyer:i.buyerWallet,token:i.token,quantity:i.quantity,maxTotalCostWei:i.maxTotalCostWei,policyVersion:input.policyVersion,evidenceHash:input.evidenceHash.startsWith('0x')?input.evidenceHash:'0x'+input.evidenceHash,traceId:traceIdBytes32(input.traceId),nonce:'0x'+randomHex(32),issuedAt:String(now),expiresAt:String(expires)};
  return validateExecutionAuthorization(auth);
}
export async function verifyHumanApproval(chainId:TestChainId,exchange:string,authorization:ExecutionAuthorization,signature:string):Promise<boolean> {
  if(!/^0x[0-9a-fA-F]{130}$/.test(signature))return false;
  try{return await loadViem().verifyTypedData({address:authorization.buyer,...humanApprovalTypedData(chainId,exchange,authorization),signature});}catch{return false;}
}
export async function verifyExecutionSignature(chainId:TestChainId,exchange:string,authorization:ExecutionAuthorization,signature:string,trustedVerifier:string):Promise<boolean> {
  try{return await loadViem().verifyTypedData({address:trustedVerifier,...executionTypedData(chainId,exchange,authorization),signature});}catch{return false;}
}
/** Internal only. Never expose this function as a generic externally supplied signing API. */
export async function signExecutionAuthorization(key:EvmKey,input:{chainId:TestChainId;exchange:string;authorization:ExecutionAuthorization;authentication:AuthenticationState;decision:AuthorizationDecision;intent:OnchainTradeIntent;claimNonce:(nonce:string)=>void|Promise<void>;now?:number}):Promise<string> {
  const now=input.now??Date.now(),a=validateExecutionAuthorization(input.authorization);
  if(input.authentication.verdict!=='VERIFIED')throw new Error('AUTHENTICATION_NOT_VERIFIED');
  if(input.decision.verdict!=='ALLOW')throw new Error('AUTHORIZATION_NOT_ALLOWED');
  if(!Number.isFinite(Date.parse(input.authentication.expiresAt))||Date.parse(input.authentication.expiresAt)<=now)throw new Error('AUTHENTICATION_EXPIRED');
  if(BigInt(a.issuedAt)*1000n>BigInt(now)||BigInt(a.expiresAt)*1000n<=BigInt(now)||BigInt(a.expiresAt)*1000n>BigInt(Date.parse(input.authentication.expiresAt)))throw new Error('AUTHORIZATION_EXPIRED_OR_FUTURE');
  if(input.intent.chainId!==input.chainId||!equal(input.intent.exchangeContract,input.exchange))throw new Error('EXECUTION_DOMAIN_MISMATCH');
  assertExecutionMatchesIntent(a,input.intent,a.policyVersion);
  if(BigInt(a.expiresAt)*1000n>BigInt(Date.parse(input.intent.expiresAt)))throw new Error('AUTHORIZATION_OUTLIVES_INTENT');
  if(input.authentication.evidenceHash&&!equal(a.evidenceHash,input.authentication.evidenceHash.replace(/^(?!0x)/,'0x')))throw new Error('AUTHENTICATION_EVIDENCE_MISMATCH');
  await input.claimNonce(a.nonce);
  return key.signTypedData(executionTypedData(input.chainId,input.exchange,a));
}
