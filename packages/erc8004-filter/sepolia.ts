import {ensure,SourceUnavailable,VerificationFailure} from '../verification-core/errors.ts';
import {BINDING_METADATA_KEY,IDENTITY_ABI,IMPLEMENTATION_SLOT,loadViem} from './viem-reader.ts';

export const SEPOLIA_CHAIN_ID=11155111;
export const SEPOLIA_CHAIN_HEX='0xaa36a7';
export const SEPOLIA_REGISTRY='0x8004A818BFB912233c491871b3d84c89A494BD9e';
export const SEPOLIA_PROXY_CODE_HASH='0xd0e45b1d89fa9b6cc7e97c1f155d64180e5c232aaccf9900ef9d4fd738c02b41';
export const SEPOLIA_IMPLEMENTATION='0x7274e874ca62410a93bd8bf61c69d8045e399c02';
export const SEPOLIA_IMPLEMENTATION_CODE_HASH='0xa5f9624ea85e45b3f4b8558581f03bfb3e6cefab278d7bf0500ec9bd065dc16f';
export const SEPOLIA_ABI_VERSION='ERC-8004 draft IdentityRegistry · observed 2026-10-14 at block 11912638';

export const REGISTER_ABI=[
 {type:'function',name:'register',stateMutability:'nonpayable',inputs:[{name:'agentURI',type:'string'}],outputs:[{name:'agentId',type:'uint256'}]},
 {type:'event',name:'Registered',anonymous:false,inputs:[{name:'agentId',type:'uint256',indexed:true},{name:'agentURI',type:'string',indexed:false},{name:'owner',type:'address',indexed:true}]}
] as const;
export const SET_METADATA_ABI=[
 {type:'function',name:'setMetadata',stateMutability:'nonpayable',inputs:[{name:'agentId',type:'uint256'},{name:'metadataKey',type:'string'},{name:'metadataValue',type:'bytes'}],outputs:[]}
] as const;

export interface WalletTransaction {from:string;to:string;data:string;value:'0x0';chainId:typeof SEPOLIA_CHAIN_HEX}
export interface ConfirmedRegistration {agentId:string;owner:string;agentURI:string;transactionHash:string;blockNumber:string;blockHash:string}

function address(value:string,code='WALLET_ADDRESS_INVALID'):string {ensure(/^0x[0-9a-fA-F]{40}$/.test(value),code);return value;}
function transactionHash(value:string):string {ensure(/^0x[0-9a-fA-F]{64}$/.test(value),'TRANSACTION_HASH_INVALID');return value;}
function strictUri(value:string):string {let u:URL;try{u=new URL(value);}catch{throw new VerificationFailure('AGENT_URI_INVALID');}ensure(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==='443'),'AGENT_URI_MUST_BE_PUBLIC_HTTPS');return u.toString();}

export function registrationTransaction(owner:string,agentURI:string):WalletTransaction {
 address(owner);const uri=strictUri(agentURI);const {encodeFunctionData}=loadViem();
 return {from:owner,to:SEPOLIA_REGISTRY,data:encodeFunctionData({abi:REGISTER_ABI,functionName:'register',args:[uri]}),value:'0x0',chainId:SEPOLIA_CHAIN_HEX};
}

export function metadataTransaction(owner:string,agentId:string,bindingHash:string):WalletTransaction {
 address(owner);ensure(/^\d{1,78}$/.test(agentId),'AGENT_ID_INVALID');ensure(/^[0-9a-f]{64}$/.test(bindingHash),'BINDING_HASH_INVALID');const {encodeFunctionData}=loadViem();
 return {from:owner,to:SEPOLIA_REGISTRY,data:encodeFunctionData({abi:SET_METADATA_ABI,functionName:'setMetadata',args:[BigInt(agentId),BINDING_METADATA_KEY,'0x'+bindingHash]}),value:'0x0',chainId:SEPOLIA_CHAIN_HEX};
}

export function sepoliaClient(rpcUrl:string):any {
 ensure(/^https:\/\//.test(rpcUrl),'SEPOLIA_RPC_MUST_USE_HTTPS');const {createPublicClient,http}=loadViem();
 return createPublicClient({transport:http(rpcUrl,{timeout:10000,retryCount:1})});
}

export async function verifySepoliaDeployment(client:any):Promise<{blockNumber:string;blockHash:string;implementation:string}> {
 const {keccak256}=loadViem();
 try{
  ensure(await client.getChainId()===SEPOLIA_CHAIN_ID,'RPC_CHAIN_MISMATCH');const blockNumber:bigint=await client.getBlockNumber();const block=await client.getBlock({blockNumber});
  const proxyCode=await client.getCode({address:SEPOLIA_REGISTRY,blockNumber});ensure(proxyCode&&proxyCode!=='0x'&&keccak256(proxyCode).toLowerCase()===SEPOLIA_PROXY_CODE_HASH,'REGISTRY_CODE_HASH_MISMATCH');
  const slot=await client.getStorageAt({address:SEPOLIA_REGISTRY,slot:IMPLEMENTATION_SLOT,blockNumber});ensure(slot&&slot!=='0x','PROXY_IMPLEMENTATION_MISSING');const implementation='0x'+slot.slice(-40);
  ensure(implementation.toLowerCase()===SEPOLIA_IMPLEMENTATION.toLowerCase(),'REGISTRY_IMPLEMENTATION_CHANGED');const implementationCode=await client.getCode({address:implementation,blockNumber});
  ensure(implementationCode&&implementationCode!=='0x'&&keccak256(implementationCode).toLowerCase()===SEPOLIA_IMPLEMENTATION_CODE_HASH,'IMPLEMENTATION_CODE_HASH_MISMATCH');
  return {blockNumber:String(blockNumber),blockHash:block.hash,implementation};
 }catch(e){if(e instanceof VerificationFailure)throw e;throw new SourceUnavailable('RPC_READ_UNAVAILABLE');}
}

async function confirmedTransaction(client:any,hash:string,expected:WalletTransaction):Promise<{receipt:any;transaction:any}> {
 transactionHash(hash);
 try{
  const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:180000});ensure(receipt.status==='success','TRANSACTION_REVERTED');
  const transaction=await client.getTransaction({hash});ensure(transaction.chainId===SEPOLIA_CHAIN_ID,'TRANSACTION_CHAIN_MISMATCH');
  ensure(transaction.from.toLowerCase()===expected.from.toLowerCase(),'TRANSACTION_SENDER_MISMATCH');ensure(transaction.to?.toLowerCase()===expected.to.toLowerCase(),'TRANSACTION_TARGET_MISMATCH');
  ensure(transaction.input.toLowerCase()===expected.data.toLowerCase(),'TRANSACTION_CALLDATA_MISMATCH');ensure(transaction.value===0n,'TRANSACTION_VALUE_MUST_BE_ZERO');
  return {receipt,transaction};
 }catch(e){if(e instanceof VerificationFailure)throw e;throw new SourceUnavailable('TRANSACTION_CONFIRMATION_UNAVAILABLE');}
}

export async function confirmRegistration(client:any,hash:string,owner:string,agentURI:string):Promise<ConfirmedRegistration> {
 const expected=registrationTransaction(owner,agentURI),{receipt}=await confirmedTransaction(client,hash,expected);const {parseEventLogs}=loadViem();
 const events=parseEventLogs({abi:REGISTER_ABI,logs:receipt.logs,eventName:'Registered',strict:true});ensure(events.length===1,'REGISTERED_EVENT_MISSING_OR_AMBIGUOUS');const args=events[0].args as any;
 ensure(String(args.owner).toLowerCase()===owner.toLowerCase(),'REGISTERED_OWNER_MISMATCH');ensure(args.agentURI===strictUri(agentURI),'REGISTERED_URI_MISMATCH');
 return {agentId:String(args.agentId),owner:String(args.owner),agentURI:args.agentURI,transactionHash:hash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash};
}

export async function confirmMetadata(client:any,hash:string,owner:string,agentId:string,bindingHash:string):Promise<{transactionHash:string;blockNumber:string;blockHash:string}> {
 const expected=metadataTransaction(owner,agentId,bindingHash),{receipt}=await confirmedTransaction(client,hash,expected);
 const value=await client.readContract({address:SEPOLIA_REGISTRY,abi:IDENTITY_ABI,functionName:'getMetadata',args:[BigInt(agentId),BINDING_METADATA_KEY],blockNumber:receipt.blockNumber});
 ensure(String(value).toLowerCase()==='0x'+bindingHash,'ONCHAIN_METADATA_MISMATCH');return {transactionHash:hash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash};
}
