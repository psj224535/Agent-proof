/** Optional, unexecuted integration. The bundled local service uses the simulator.
 * Install integrations/ first. All reads are pinned to one block; RPC failure is
 * never silently treated as "agent not registered". Pin the reviewed proxy and
 * implementation code hashes before connecting a trusted verifier to this adapter.
 */
import {createRequire} from 'node:module';
import type {Identity,RegistrySnapshot} from '../shared-schemas/types.ts';
import type {RegistryReader} from '../verification-core/context.ts';
import {ensure,SourceUnavailable,VerificationFailure} from '../verification-core/errors.ts';
export const IDENTITY_ABI = [
 {type:'function',name:'ownerOf',stateMutability:'view',inputs:[{name:'tokenId',type:'uint256'}],outputs:[{type:'address'}]},
 {type:'function',name:'tokenURI',stateMutability:'view',inputs:[{name:'tokenId',type:'uint256'}],outputs:[{type:'string'}]},
 {type:'function',name:'getAgentWallet',stateMutability:'view',inputs:[{name:'agentId',type:'uint256'}],outputs:[{type:'address'}]},
 {type:'function',name:'getMetadata',stateMutability:'view',inputs:[{name:'agentId',type:'uint256'},{name:'metadataKey',type:'string'}],outputs:[{type:'bytes'}]},
 {type:'error',name:'ERC721NonexistentToken',inputs:[{name:'tokenId',type:'uint256'}]}
] as const;
export const IMPLEMENTATION_SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
export const BINDING_METADATA_KEY='agentproof.runtimeBinding.v1';
interface Options {rpcUrl:string;chainId:31337|11155111;registry:string;proxyCodeHash:string;implementationCodeHash:string;confirmations?:number;abiVersion:string}
export function loadViem():any {
 const require=createRequire(new URL('../../integrations/package.json',import.meta.url));
 try{return require('viem');}catch{throw new Error('Run npm install --prefix integrations before using on-chain tools.');}
}
export function createViemRegistryReader(options:Options):RegistryReader {
 ensure([31337,11155111].includes(options.chainId),'ONLY_TEST_CHAINS_ALLOWED');
 ensure(/^0x[0-9a-fA-F]{40}$/.test(options.registry),'REGISTRY_ADDRESS_INVALID');
 ensure(Number.isInteger(options.confirmations??0)&&(options.confirmations??0)>=0,'INVALID_CONFIRMATIONS');
 const {createPublicClient,http,keccak256}=loadViem();
 const client=createPublicClient({transport:http(options.rpcUrl,{timeout:5000,retryCount:0})});
 return {async read(identity:Identity,signal?:AbortSignal):Promise<RegistrySnapshot|null>{
  ensure(identity.chainId===options.chainId&&identity.registry.toLowerCase()===options.registry.toLowerCase(),'CHAIN_OR_REGISTRY_NOT_ALLOWED');
  ensure(/^\d{1,78}$/.test(identity.agentId),'AGENT_ID_INVALID');
  try {
   signal?.throwIfAborted();ensure(await client.getChainId()===options.chainId,'RPC_CHAIN_MISMATCH');
   const latest:bigint=await client.getBlockNumber();const depth=BigInt(options.confirmations??0);
   ensure(latest>=depth,'CONFIRMATION_DEPTH_UNAVAILABLE');const blockNumber=latest-depth;
   const block=await client.getBlock({blockNumber});
   const code=await client.getCode({address:options.registry,blockNumber});
   ensure(code&&code!=='0x'&&keccak256(code).toLowerCase()===options.proxyCodeHash.toLowerCase(),'REGISTRY_CODE_HASH_MISMATCH');
   const slot=await client.getStorageAt({address:options.registry,slot:IMPLEMENTATION_SLOT,blockNumber});
   ensure(slot&&slot!=='0x','PROXY_IMPLEMENTATION_MISSING');const implementation='0x'+slot.slice(-40);
   const implementationCode=await client.getCode({address:implementation,blockNumber});
   ensure(implementationCode&&implementationCode!=='0x'&&keccak256(implementationCode).toLowerCase()===options.implementationCodeHash.toLowerCase(),'IMPLEMENTATION_CODE_HASH_MISMATCH');
   const call=(functionName:string,args:unknown[])=>client.readContract({address:options.registry,abi:IDENTITY_ABI,functionName,args,blockNumber});
   let owner:string;
   try{owner=await call('ownerOf',[BigInt(identity.agentId)]);}catch(error){
    let e:any=error;for(let n=0;e&&n<12;n++,e=e.cause)if(e.data?.errorName==='ERC721NonexistentToken')return null;
    throw error;
   }
   const [agentURI,agentWallet,rawBinding]=await Promise.all([call('tokenURI',[BigInt(identity.agentId)]),call('getAgentWallet',[BigInt(identity.agentId)]),call('getMetadata',[BigInt(identity.agentId),BINDING_METADATA_KEY])]);
   ensure(/^0x[0-9a-fA-F]{64}$/.test(rawBinding),'RUNTIME_BINDING_METADATA_MISSING');
   signal?.throwIfAborted();const check=await client.getBlock({blockNumber});ensure(check.hash===block.hash,'BLOCK_REORG_DURING_READ');
   return {identity,owner,agentWallet,agentURI,runtimeBindingHash:rawBinding.slice(2).toLowerCase(),blockNumber:String(blockNumber),blockHash:block.hash,abiVersion:options.abiVersion,source:options.chainId===31337?'anvil':'sepolia'};
  }catch(e){if(e instanceof VerificationFailure)throw e;throw new SourceUnavailable('RPC_READ_UNAVAILABLE');}
 }};
}
