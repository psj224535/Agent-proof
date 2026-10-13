/** Read-only deployment inspection; no key, wallet, signing, or transaction. */
import {loadViem,IMPLEMENTATION_SLOT} from '../packages/erc8004-filter/viem-reader.ts';
import {ensure} from '../packages/verification-core/errors.ts';
const rpcUrl=process.env.SEPOLIA_RPC_URL;
if(!rpcUrl)throw new Error('Set SEPOLIA_RPC_URL. This command performs read-only Sepolia RPC calls.');
const registry=process.env.SEPOLIA_REGISTRY_ADDRESS??'0x8004A818BFB912233c491871b3d84c89A494BD9e';
ensure(/^0x[0-9a-fA-F]{40}$/.test(registry),'REGISTRY_ADDRESS_INVALID');
const {createPublicClient,http,keccak256}=loadViem();
try{
 const c=createPublicClient({transport:http(rpcUrl,{timeout:8000,retryCount:0})});
 ensure(await c.getChainId()===11155111,'NOT_SEPOLIA');
 const blockNumber=await c.getBlockNumber(),block=await c.getBlock({blockNumber});
 const code=await c.getCode({address:registry,blockNumber});ensure(code&&code!=='0x','NO_REGISTRY_BYTECODE');
 const slot=await c.getStorageAt({address:registry,slot:IMPLEMENTATION_SLOT,blockNumber});
 ensure(slot&&slot!=='0x','IMPLEMENTATION_SLOT_EMPTY');const implementation='0x'+slot.slice(-40);
 const implCode=await c.getCode({address:implementation,blockNumber});ensure(implCode&&implCode!=='0x','NO_IMPLEMENTATION_BYTECODE');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),chainId:11155111,registry,blockNumber:String(blockNumber),blockHash:block.hash,proxyCodeHash:keccak256(code),implementation,implementationCodeHash:keccak256(implCode),note:'Observed bytecode is NOT proof of source authenticity. Independently review and pin it; no transaction was submitted.'},null,2));
}catch(e){console.error('Sepolia inspection failed. No transactions were sent.');process.exitCode=1;}
