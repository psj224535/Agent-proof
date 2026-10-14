import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {serve,stateDir,saveJson,reply,staticFile,jsonRequest} from '../common/http.ts';
import {createDocuments,presentation,addProof,authenticateTransport,protectedTransport} from '../../packages/agent-kit/index.ts';
import type {AgentDocuments} from '../../packages/agent-kit/index.ts';
import {createPassport,bundleHash} from '../../packages/aps-passport-filter/passport.ts';
import {hash,iso} from '../../packages/crypto/index.ts';
import {validate,obj,S} from '../../packages/shared-schemas/index.ts';
import type {AuthenticationResult,Presentation,Purchase,RegistrySnapshot,Transport} from '../../packages/shared-schemas/types.ts';
import {ensure,VerificationFailure} from '../../packages/verification-core/errors.ts';
import {createViemRegistryReader} from '../../packages/erc8004-filter/viem-reader.ts';
import {SafeFetcher} from '../../packages/network/safe-fetch.ts';
import {SEPOLIA_ABI_VERSION,SEPOLIA_CHAIN_ID,SEPOLIA_CHAIN_HEX,SEPOLIA_IMPLEMENTATION_CODE_HASH,SEPOLIA_PROXY_CODE_HASH,SEPOLIA_REGISTRY,confirmMetadata,confirmRegistration,metadataTransaction,registrationTransaction,sepoliaClient,verifySepoliaDeployment} from '../../packages/erc8004-filter/sepolia.ts';

const AGENT_NAME='PM';
const AGENT_DESCRIPTION='간단한 작업 요청을 처리하고 AgentProof로 신원을 검증하는 테스트 에이전트';
interface SepoliaState {documents:AgentDocuments;registrationTransaction:string;metadataTransaction?:string;updatedAt:string}

function writePublicJson(path:string,value:unknown):void {mkdirSync(resolve(path,'..'),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o644});}

export async function startSepoliaAgent(){
 ensure(process.env.AGENTPROOF_NETWORK==='sepolia','SEPOLIA_MODE_REQUIRED');
 const owner=(process.env.AGENT_OWNER_ADDRESS??'0x422A6dDB79F4a13B58f7aAedD92f464c3e1e70A9');ensure(/^0x[0-9a-fA-F]{40}$/.test(owner),'AGENT_OWNER_ADDRESS_INVALID');
 const pagesOrigin=(process.env.AGENT_PUBLIC_ORIGIN??'https://psj224535.github.io/Agent-proof').replace(/\/$/,'');ensure(/^https:\/\//.test(pagesOrigin),'PUBLIC_ORIGIN_MUST_USE_HTTPS');
 const agentURI=pagesOrigin+'/.well-known/agent-registration.json',cardURI=pagesOrigin+'/.well-known/agent-card.json';
 const rpcUrl=process.env.SEPOLIA_RPC_URL??'https://ethereum-sepolia-rpc.publicnode.com';
 const verifierOrigin=process.env.VERIFIER_ORIGIN??'http://127.0.0.1:3101',audience=new URL(verifierOrigin).host;
 const dir=stateDir('agent'),statePath=join(dir,'sepolia-agent.json'),siteRoot=resolve(process.env.PUBLIC_SITE_DIR??'site');
 let state:SepoliaState|undefined=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):undefined;let lastResult:AuthenticationResult|undefined,queue=Promise.resolve();
 const client=sepoliaClient(rpcUrl);const deployment=await verifySepoliaDeployment(client);
 const publicFetcher=new SafeFetcher({development:false,timeoutMs:8000});
 const registryReader=createViemRegistryReader({rpcUrl,chainId:SEPOLIA_CHAIN_ID,registry:SEPOLIA_REGISTRY,proxyCodeHash:SEPOLIA_PROXY_CODE_HASH,implementationCodeHash:SEPOLIA_IMPLEMENTATION_CODE_HASH,confirmations:0,abiVersion:SEPOLIA_ABI_VERSION});
 function save(){ensure(state,'SEPOLIA_AGENT_NOT_REGISTERED');saveJson(statePath,state);}
 function publish(){ensure(state,'SEPOLIA_AGENT_NOT_REGISTERED');writePublicJson(join(siteRoot,'.well-known','agent-registration.json'),state.documents.registration);writePublicJson(join(siteRoot,'.well-known','agent-card.json'),state.documents.card);}
 function publicState(snapshot?:RegistrySnapshot|null){return {registered:Boolean(state),network:'Ethereum Sepolia',chainId:SEPOLIA_CHAIN_ID,registry:SEPOLIA_REGISTRY,owner,agentURI,cardURI,name:AGENT_NAME,description:AGENT_DESCRIPTION,registrationTransaction:state?.registrationTransaction??null,metadataTransaction:state?.metadataTransaction??null,agentId:state?.documents.identity.agentId??null,bindingHash:state?.documents.registration.agentproof.runtimeBindingHash??null,snapshot:snapshot??state?.documents.snapshot??null,publicFilesReady:Boolean(state),verificationReady:Boolean(state?.metadataTransaction),updatedAt:state?.updatedAt??null};}
 async function chainSnapshot():Promise<RegistrySnapshot|null>{if(!state?.metadataTransaction)return null;return registryReader.read(state.documents.identity);}
 async function prepareRegister(input:unknown){const body=validate<{owner:string}>(obj({owner:S}),input);ensure(body.owner.toLowerCase()===owner.toLowerCase(),'CONNECTED_WALLET_NOT_CONFIGURED_OWNER');ensure(!state,'AGENT_ALREADY_REGISTERED_LOCALLY');let publicRegistration:any;try{publicRegistration=(await publicFetcher.json(agentURI)).value;}catch{throw new VerificationFailure('PUBLIC_AGENT_URI_NOT_READY');}ensure(publicRegistration?.type==='https://eips.ethereum.org/EIPS/eip-8004#registration-v1'&&publicRegistration?.name===AGENT_NAME,'PUBLIC_AGENT_URI_NOT_READY');return {transaction:registrationTransaction(owner,agentURI),agentURI};}
 async function acceptRegistration(input:unknown){const body=validate<{txHash:string;owner:string}>(obj({txHash:S,owner:S}),input);ensure(body.owner.toLowerCase()===owner.toLowerCase(),'CONNECTED_WALLET_NOT_CONFIGURED_OWNER');
  const receipt=await confirmRegistration(client,body.txHash,owner,agentURI);ensure(/^\d{1,15}$/.test(receipt.agentId),'AGENT_ID_TOO_LARGE_FOR_LOCAL_PROFILE');
  const documents=createDocuments({agentOrigin:pagesOrigin,agentId:receipt.agentId,chainId:SEPOLIA_CHAIN_ID,registry:SEPOLIA_REGISTRY,ownerAddress:owner,agentName:AGENT_NAME,description:AGENT_DESCRIPTION,validityMs:365*24*60*60*1000});
  documents.snapshot={identity:documents.identity,owner,agentWallet:owner,agentURI,runtimeBindingHash:documents.registration.agentproof.runtimeBindingHash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,abiVersion:SEPOLIA_ABI_VERSION,source:'sepolia'};
  state={documents,registrationTransaction:receipt.transactionHash,updatedAt:iso(Date.now())};save();publish();return publicState();
 }
 async function prepareMetadata(input:unknown){validate(obj({}),input);ensure(state,'SEPOLIA_AGENT_NOT_REGISTERED');return {transaction:metadataTransaction(owner,state.documents.identity.agentId,state.documents.registration.agentproof.runtimeBindingHash),metadataKey:'agentproof.runtimeBinding.v1',metadataValue:'0x'+state.documents.registration.agentproof.runtimeBindingHash};}
 async function acceptMetadata(input:unknown){const body=validate<{txHash:string}>(obj({txHash:S}),input);ensure(state,'SEPOLIA_AGENT_NOT_REGISTERED');
  await confirmMetadata(client,body.txHash,owner,state.documents.identity.agentId,state.documents.registration.agentproof.runtimeBindingHash);state.metadataTransaction=body.txHash;const snapshot=await chainSnapshot();ensure(snapshot,'AGENT_NOT_REGISTERED');state.documents.snapshot=snapshot;state.updatedAt=iso(Date.now());save();publish();return publicState(snapshot);
 }
 async function send(t:Transport){const response=await fetch(new URL(t.path,verifierOrigin),{method:t.method,headers:t.headers,body:t.rawBody,signal:AbortSignal.timeout(30000),redirect:'error'});const result=await response.json() as any;if(!response.ok)throw new Error(result.error??'VERIFIER_REQUEST_FAILED');return result;}
 async function authenticate(input:unknown){ensure(state?.metadataTransaction,'COMPLETE_ONCHAIN_METADATA_FIRST');
  const body=validate<any>(obj({merchant:S,productId:S,amount:{type:'integer',minimum:0},purpose:{enum:['payment','browsing']},quantity:{type:'integer',minimum:1,maximum:100000},expirationSeconds:{type:'integer',minimum:10,maximum:300}}),input);
  const d=state.documents;d.passport=createPassport(d.key);const {expirationSeconds,...purchase}=body;const now=Math.floor(Date.now()/1000)*1000;
  const p=presentation(d,audience,Date.now(),{...purchase,currency:'KRW',createdAt:iso(now),expiresAt:iso(now+expirationSeconds*1000)} as Partial<Purchase>);p.bundleHash=bundleHash(p);
  const challenge=await jsonRequest(verifierOrigin,'/api/v1/challenges',{subjectAgent:p.claimedIdentity,runtimeKeyId:d.key.keyId,requestId:p.requestId,requestHash:p.bundleHash});addProof(p,challenge,d.key);
  const transport=authenticateTransport(p,d.key,audience);const result=await send(transport) as AuthenticationResult;lastResult=result;let protectedResult:unknown;
  if(result.ticket)protectedResult=await send(protectedTransport(p,result.ticket,d.key,audience));return {presentation:p,result,protectedResult,traceUrl:verifierOrigin+'/?trace='+result.traceId};
 }
 function serialized<T>(f:()=>Promise<T>):Promise<T>{const task=queue.then(f);queue=task.then(()=>undefined,()=>undefined);return task;}
 const server=await serve(Number(process.env.SEPOLIA_AGENT_PORT??3100),async r=>{
  if(staticFile(r,'sepolia-console'))return;
  if(r.method==='GET'&&r.path==='/health'){reply(r.res,200,{ok:true,network:'sepolia',deployment});return;}
  if(r.method==='GET'&&r.path==='/api/public/config'){reply(r.res,200,{network:'sepolia',chainId:SEPOLIA_CHAIN_ID,chainHex:SEPOLIA_CHAIN_HEX,registry:SEPOLIA_REGISTRY,owner,agentURI,cardURI,pagesOrigin,verifierOrigin,etherscanRegistry:'https://sepolia.etherscan.io/address/'+SEPOLIA_REGISTRY,erc8004scan:'https://www.8004scan.io/agents?network=sepolia'});return;}
  if(r.method==='GET'&&r.path==='/api/sepolia/status'){let snapshot:null|RegistrySnapshot=null;try{snapshot=await chainSnapshot();}catch{}reply(r.res,200,publicState(snapshot));return;}
  if(r.method==='GET'&&r.path==='/api/sepolia/publication'){if(!state){reply(r.res,200,{published:false,reason:'AGENT_NOT_REGISTERED'});return;}try{const [registration,card]=await Promise.all([publicFetcher.json(agentURI),publicFetcher.json(cardURI)]);reply(r.res,200,{published:hash(registration.value)===hash(state.documents.registration)&&hash(card.value)===hash(state.documents.card),registration,card});}catch(error){reply(r.res,200,{published:false,reason:(error as any).code??'PUBLICATION_UNAVAILABLE'});}return;}
  if(r.method==='GET'&&r.path==='/.well-known/agent-registration.json'){ensure(state,'SEPOLIA_AGENT_NOT_REGISTERED');reply(r.res,200,state.documents.registration);return;}
  if(r.method==='GET'&&r.path==='/.well-known/agent-card.json'){ensure(state,'SEPOLIA_AGENT_NOT_REGISTERED');reply(r.res,200,state.documents.card);return;}
  if(r.method==='POST'&&r.path==='/api/sepolia/transactions/register'){reply(r.res,200,await serialized(()=>prepareRegister(r.json)));return;}
  if(r.method==='POST'&&r.path==='/api/sepolia/registrations/confirm'){reply(r.res,200,await serialized(()=>acceptRegistration(r.json)));return;}
  if(r.method==='POST'&&r.path==='/api/sepolia/transactions/metadata'){reply(r.res,200,await serialized(()=>prepareMetadata(r.json)));return;}
  if(r.method==='POST'&&r.path==='/api/sepolia/metadata/confirm'){reply(r.res,200,await serialized(()=>acceptMetadata(r.json)));return;}
  if(r.method==='POST'&&r.path==='/api/sepolia/publish'){validate(obj({}),r.json);publish();reply(r.res,200,{ok:true,paths:['site/.well-known/agent-registration.json','site/.well-known/agent-card.json']});return;}
  if(r.method==='POST'&&r.path==='/api/presentations'){reply(r.res,200,await serialized(()=>authenticate(r.json)));return;}
  if(r.method==='GET'&&r.path==='/api/last-result'){reply(r.res,200,lastResult??null);return;}
 });return {server,close:async()=>server.close()};
}
if(import.meta.url===new URL(process.argv[1],'file://').href)await startSepoliaAgent();
