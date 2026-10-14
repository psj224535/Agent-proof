import {join} from 'node:path';import {readFileSync} from 'node:fs';
import {serve,stateDir,loadKey,secret,reply,admin,staticFile} from '../common/http.ts';
import {SQLite,openPostgres} from '../../packages/storage/sql.ts';import {Store} from '../../packages/storage/store.ts';
import {Verifier} from '../../packages/verification-core/engine.ts';
import {SafeFetcher} from '../../packages/network/safe-fetch.ts';
import {SIM_REGISTRY} from '../../packages/agent-kit/index.ts';
import {createViemRegistryReader} from '../../packages/erc8004-filter/viem-reader.ts';
import {SEPOLIA_ABI_VERSION,SEPOLIA_CHAIN_ID,SEPOLIA_IMPLEMENTATION_CODE_HASH,SEPOLIA_PROXY_CODE_HASH,SEPOLIA_REGISTRY} from '../../packages/erc8004-filter/sepolia.ts';
import {validate,modulePatchSchema,parseJsonStrict,MODULE_IDS,obj} from '../../packages/shared-schemas/index.ts';
import type {ModuleId,Presentation,RegistrySnapshot,TrustStore} from '../../packages/shared-schemas/types.ts';
import {profileFor,DEPENDENCIES,defaultConfiguration,applyEnvironment} from '../../packages/verification-core/config.ts';
import {ensure,SourceUnavailable} from '../../packages/verification-core/errors.ts';
export async function startVerifier(){
 const network=process.env.AGENTPROOF_NETWORK??'simulation',development=network==='simulation';ensure(network==='simulation'||network==='sepolia','UNSUPPORTED_NETWORK_MODE');ensure(process.env.AGENTPROOF_DEVELOPMENT===(development?'true':'false'),'NETWORK_DEVELOPMENT_FLAG_MISMATCH');
 const dir=stateDir('verifier'),token=secret(join(dir,'admin-token')),ticketKey=loadKey(join(dir,'ticket-key.json'));
 const trust=JSON.parse(readFileSync(join(dir,'trust.json'),'utf8')) as TrustStore;
 const initial=applyEnvironment(defaultConfiguration());if(!development){initial.modules['company-attestation'].enabled=false;initial.modules['company-attestation'].required=false;for(const id of ['erc8004','a2a','aps-passport','visa-tap'] as ModuleId[])initial.modules[id].timeoutMs=8000;}
 const store=new Store(process.env.DATABASE_URL?await openPostgres(process.env.DATABASE_URL):new SQLite(join(dir,'verifier.sqlite')));await store.init(initial);
 const agentOrigin=process.env.AGENT_ORIGIN??'http://127.0.0.1:3000',issuerOrigin=process.env.ISSUER_ORIGIN??'http://127.0.0.1:3003',registryOrigin=process.env.REGISTRY_ORIGIN??'http://127.0.0.1:3002';
 const fetcher=new SafeFetcher(development?{development:true,allowedDevelopmentOrigins:[agentOrigin,issuerOrigin,registryOrigin]}:{development:false,timeoutMs:8000});
 const chainId=development?31337:SEPOLIA_CHAIN_ID,registryAddress=development?SIM_REGISTRY:SEPOLIA_REGISTRY;
 const registryReader=development?{async read(id:Presentation['claimedIdentity'],signal?:AbortSignal){return (await fetcher.json(registryOrigin+'/agents/'+id.agentId,signal)).value as RegistrySnapshot|null;}}:createViemRegistryReader({rpcUrl:process.env.SEPOLIA_RPC_URL??'https://ethereum-sepolia-rpc.publicnode.com',chainId:SEPOLIA_CHAIN_ID,registry:SEPOLIA_REGISTRY,proxyCodeHash:SEPOLIA_PROXY_CODE_HASH,implementationCodeHash:SEPOLIA_IMPLEMENTATION_CODE_HASH,confirmations:Number(process.env.SEPOLIA_CONFIRMATIONS??'0'),abiVersion:SEPOLIA_ABI_VERSION});
 const audience=new URL(process.env.VERIFIER_ORIGIN??'http://127.0.0.1:3001').host;
 const assuranceProfile=development?'DEVELOPMENT_MINIMAL':'SEPOLIA_TESTNET';
 const verifier=new Verifier({store,fetcher,registryReader,trust,ticketKey,audience,chainId,registryAddress,development,assuranceProfile});
 const server=await serve(Number(process.env.VERIFIER_PORT??3001),async r=>{
  if(staticFile(r,'verifier-dashboard'))return;
  if(r.method==='GET'&&r.path==='/health'){reply(r.res,200,{ok:true,network,development,persistence:store.sql.dialect});return;}
  if(r.method==='GET'&&r.path==='/api/public/config'){reply(r.res,200,{network,development,assuranceProfile,agentOrigin,audience,chainId,registryAddress});return;}
  if(r.method==='POST'&&r.path==='/api/v1/challenges'){reply(r.res,200,await verifier.challenge(r.json));return;}
  if(r.method==='POST'&&r.path==='/api/v1/authenticate'){reply(r.res,200,await verifier.authenticate(r.json as Presentation,r.transport));return;}
  if(r.method==='POST'&&r.path==='/api/v1/protected/mock-purchase'){reply(r.res,200,await verifier.protectedPurchase(r.transport));return;}
  if(r.path.startsWith('/api/v1/'))admin(r,token);
  if(r.method==='GET'&&r.path==='/api/v1/modules'){const c=await store.configuration();reply(r.res,200,{configuration:c,policyProfile:profileFor(c),assuranceProfile,dependencies:DEPENDENCIES});return;}
  const mm=/^\/api\/v1\/modules\/([a-z0-9-]+)$/.exec(r.path);
  if(r.method==='PATCH'&&mm){ensure(MODULE_IDS.includes(mm[1] as ModuleId),'UNKNOWN_MODULE');const p=validate<any>(modulePatchSchema,r.json);const updated=await store.changeConfiguration(p.expectedVersion,c=>{for(const k of ['enabled','required','timeoutMs'])if(p[k]!==undefined)(c.modules[mm[1] as ModuleId] as any)[k]=p[k];});
   const trace=await store.newTrace({chainId,registry:registryAddress,agentId:'0'},Date.now());await store.audit(trace,'ADMIN_CONFIGURATION_CHANGED',{actor:'system-administrator',configuration:updated,output:{policyProfile:profileFor(updated)}});reply(r.res,200,{configuration:updated,policyProfile:profileFor(updated),assuranceProfile});return;}
  if(r.method==='PATCH'&&r.path==='/api/v1/execution-mode'){const p=validate<any>(obj({expectedVersion:{type:'integer',minimum:1},mode:{enum:['failFast','continueAll']}}),r.json);const updated=await store.changeConfiguration(p.expectedVersion,c=>{c.mode=p.mode;});const trace=await store.newTrace({chainId,registry:registryAddress,agentId:'0'},Date.now());await store.audit(trace,'ADMIN_EXECUTION_MODE_CHANGED',{actor:'system-administrator',configuration:updated,output:{mode:updated.mode}});reply(r.res,200,updated);return;}
  if(r.method==='GET'&&r.path==='/api/v1/traces'){reply(r.res,200,await store.traces());return;}
  const m=/^\/api\/v1\/traces\/([a-z0-9-]{36})$/.exec(r.path);
  if(r.method==='GET'&&m){const trace=await store.trace(m[1]);reply(r.res,trace?200:404,trace??{error:'TRACE_NOT_FOUND'});return;}
  const ev=/^\/api\/v1\/evidence\/([0-9a-f]{64})$/.exec(r.path);
  if(r.method==='GET'&&ev){const e=await store.evidence(ev[1]);reply(r.res,e?200:404,e??{error:'EVIDENCE_NOT_FOUND'});return;}
  if(r.method==='GET'&&r.path==='/api/v1/security-events'){reply(r.res,200,(await store.traces()).filter((t:any)=>t.result&&t.result.verdict!=='VERIFIED'));return;}
  const ag=/^\/api\/v1\/agents\/(\d{1,15})$/.exec(r.path);
  if(r.method==='GET'&&ag){reply(r.res,200,await registryReader.read({chainId,registry:registryAddress,agentId:ag[1]}));return;}
 });return {server,store,verifier,close:async()=>{server.close();await store.close();}};
}
if(import.meta.url===new URL(process.argv[1],'file://').href)await startVerifier();
