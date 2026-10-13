import {join} from 'node:path';import {readFileSync,existsSync} from 'node:fs';import {randomInt} from 'node:crypto';
import {serve,stateDir,saveJson,reply,staticFile,jsonRequest} from '../common/http.ts';
import {createDocuments,presentation,addProof,authenticateTransport,protectedTransport} from '../../packages/agent-kit/index.ts';
import type {AgentDocuments} from '../../packages/agent-kit/index.ts';
import {hash,iso,randomHex,keyPair,signObject,signBytes} from '../../packages/crypto/index.ts';
import {createPassport,bundleHash} from '../../packages/aps-passport-filter/passport.ts';
import {validate,obj,S,purchaseSchema,parseJsonStrict} from '../../packages/shared-schemas/index.ts';
import type {Presentation,Transport,AuthenticationResult,Purchase} from '../../packages/shared-schemas/types.ts';
import {ensure} from '../../packages/verification-core/errors.ts';
export const SCENARIOS=[['normal','정상 요청'],['unregistered','미등록 Agent'],['cloned-id','복제 Agent ID'],['changed-card','변경된 Agent Card'],['stale-card','오래된 Agent Card'],['forged-passport','위조 Passport'],['expired-passport','만료 Passport'],['wrong-key','다른 키로 서명'],['revoked-company','취소된 회사 자료'],['wrong-merchant','다른 판매처용 TAP'],['changed-payload','서명 후 payload 변경'],['replay','nonce 재사용'],['ownership-transfer','소유권 이전 후 이전 키']];
export async function startAgent(){
 ensure(process.env.AGENTPROOF_DEVELOPMENT==='true','THIS_LAUNCHER_IS_DEVELOPMENT_ONLY');
 const dir=stateDir('agent'),statePath=join(dir,'documents.json');let documents:AgentDocuments|undefined=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):undefined;
 const agentOrigin=process.env.AGENT_ORIGIN??'http://127.0.0.1:3000',verifierOrigin=process.env.VERIFIER_ORIGIN??'http://127.0.0.1:3001',registryOrigin=process.env.REGISTRY_ORIGIN??'http://127.0.0.1:3002',issuerOrigin=process.env.ISSUER_ORIGIN??'http://127.0.0.1:3003';const audience=new URL(verifierOrigin).host;
 let lastResult:AuthenticationResult|undefined,lastPresentation:Presentation|undefined,lastTransport:Transport|undefined,queue=Promise.resolve();
 const save=()=>saveJson(statePath,documents);
 function publicDocs(){if(!documents)return {prepared:false};const {key,ownerKey,...visible}=documents;return {prepared:true,simulation:true,...visible};}
 async function prepare(){documents=createDocuments({agentOrigin,agentId:String(randomInt(1,1000000000))});save();return publicDocs();}
 async function register(){ensure(documents,'PREPARE_AGENT_FIRST');const now=Date.now();const body={snapshot:documents.snapshot,ownerKey:documents.ownerKey.publicKeyMultibase,issuedAt:iso(now),expiresAt:iso(now+30000),nonce:randomHex(32)};const r=await jsonRequest(registryOrigin,'/register',{...body,signature:signObject(documents.ownerKey,'AGENTPROOF-SIM-REGISTER-V1',body)});documents.snapshot=r.snapshot;save();return r;}
 async function attest(){ensure(documents,'PREPARE_AGENT_FIRST');documents.attestation=await jsonRequest(issuerOrigin,'/attest',{binding:documents.binding,signature:signObject(documents.key,'AGENTPROOF-TEST-ATTEST-REQUEST-V1',documents.binding)});save();return documents.attestation;}
 async function send(t:Transport){const response=await fetch(new URL(t.path,verifierOrigin),{method:t.method,headers:t.headers,body:t.rawBody,signal:AbortSignal.timeout(20000),redirect:'error'});const result=parseJsonStrict(Buffer.from(await response.arrayBuffer())) as any;if(!response.ok)throw new Error(result.error??'VERIFIER_REQUEST_FAILED');return result;}
 async function build(scenario:string,purchase:Partial<Purchase>={}){
  ensure(documents,'PREPARE_AGENT_FIRST');const d=documents;let p=presentation(d,audience,Date.now(),purchase);let signingKey=d.key;
  if(scenario==='unregistered')p.claimedIdentity.agentId='999999999999999';
  if(scenario==='changed-card')p.presentedAgentCard.name+=' (tampered)';
  if(scenario==='stale-card')p.presentedAgentCard.capabilities.extensions[0].params.expiresAt=iso(Date.now()-1000);
  if(scenario==='forged-passport')p.presentedPassport!.signature=signBytes(keyPair(),Buffer.from('forged'));
  if(scenario==='expired-passport')p.presentedPassport=createPassport(d.key,Date.now()-7200000,3600000);
  if(scenario==='wrong-key')signingKey=keyPair();
  if(scenario==='wrong-merchant')p.tapRequest.merchant='other-merchant.example';
  p.bundleHash=bundleHash(p);
  const ch=await jsonRequest(verifierOrigin,'/api/v1/challenges',{subjectAgent:p.claimedIdentity,runtimeKeyId:d.key.keyId,requestId:p.requestId,requestHash:p.bundleHash});addProof(p,ch,scenario==='cloned-id'?keyPair():d.key);
  let t=authenticateTransport(p,signingKey,audience);
  if(scenario==='changed-payload'){p.tapRequest.amount+=1;p.bundleHash=bundleHash(p);t.rawBody=Buffer.from(JSON.stringify(p));}
  return {p,t};
 }
 async function run(scenario:string,purchase:Partial<Purchase>={},fresh=false){
  ensure(SCENARIOS.some(s=>s[0]===scenario),'UNKNOWN_SCENARIO');
  // Every scenario starts from newly registered test evidence, never by modifying verifier configuration.
  if(fresh||scenario!=='normal'||!documents?.attestation){await prepare();await register();await attest();}
  const d=documents!;
  if(scenario==='revoked-company')await jsonRequest(issuerOrigin,'/revoke',{attestationId:d.attestation!.attestationId,signature:signObject(d.key,'AGENTPROOF-TEST-REVOKE-V1',{attestationId:d.attestation!.attestationId})});
  if(scenario==='ownership-transfer'){const now=Date.now();const body={agentId:d.identity.agentId,newOwnerKey:keyPair().publicKeyMultibase,issuedAt:iso(now),expiresAt:iso(now+30000),nonce:randomHex(32)};await jsonRequest(registryOrigin,'/transfer',{...body,signature:signObject(d.ownerKey,'AGENTPROOF-SIM-TRANSFER-V1',body)});}
  const {p,t}=await build(scenario,purchase);let result=await send(t) as AuthenticationResult;
  let firstResult:unknown;
  if(scenario==='replay'){firstResult={verdict:result.verdict,traceId:result.traceId};result=await send(t) as AuthenticationResult;}
  lastResult=result;lastPresentation=p;lastTransport=t;
  let protectedResult:unknown;
  if(result.ticket)protectedResult=await send(protectedTransport(p,result.ticket,d.key,audience));
  return {scenario,presentation:p,request:{method:t.method,path:t.path,authority:t.authority,headers:t.headers},result,firstResult,protectedResult,traceUrl:verifierOrigin+'/?trace='+result.traceId};
 }
 async function serialized<T>(f:()=>Promise<T>):Promise<T>{const task=queue.then(f);queue=task.then(()=>undefined,()=>undefined);return task;}
 const server=await serve(Number(process.env.AGENT_PORT??3000),async r=>{
  if(staticFile(r,'agent-portal'))return;
  if(r.method==='GET'&&r.path==='/health'){reply(r.res,200,{ok:true,simulation:true});return;}
  if(r.method==='GET'&&r.path==='/api/public/config'){reply(r.res,200,{development:true,audience,verifierOrigin,scenarios:SCENARIOS});return;}
  if(r.method==='GET'&&r.path==='/.well-known/agent-card.json'){ensure(documents,'PREPARE_AGENT_FIRST');reply(r.res,200,documents.card);return;}
  if(r.method==='GET'&&r.path==='/.well-known/agent-registration.json'){ensure(documents,'PREPARE_AGENT_FIRST');reply(r.res,200,documents.registration);return;}
  if(r.method==='GET'&&r.path==='/api/documents'){reply(r.res,200,publicDocs());return;}
  if(r.method==='POST'&&r.path==='/api/agents/prepare'){validate(obj({}),r.json);reply(r.res,200,await serialized(prepare));return;}
  if(r.method==='POST'&&r.path==='/api/agents/register'){validate(obj({}),r.json);reply(r.res,200,await serialized(register));return;}
  if(r.method==='POST'&&r.path==='/api/passports'){validate(obj({}),r.json);ensure(documents,'PREPARE_AGENT_FIRST');documents.passport=createPassport(documents.key);save();reply(r.res,200,documents.passport);return;}
  if(r.method==='POST'&&r.path==='/api/company-attestations'){validate(obj({}),r.json);reply(r.res,200,await serialized(attest));return;}
  if(r.method==='POST'&&r.path==='/api/tap/requests'){validate(obj({}),r.json);const {p,t}=await serialized(()=>build('normal'));reply(r.res,200,{presentation:p,headers:t.headers,method:t.method,path:t.path});return;}
  if(r.method==='POST'&&r.path==='/api/presentations'){
   const input=validate<any>(obj({merchant:S,productId:S,amount:{type:'integer',minimum:0},purpose:{enum:['payment','browsing']},quantity:{type:'integer',minimum:1,maximum:100000},expirationSeconds:{type:'integer',minimum:10,maximum:300}}),r.json);
   const {expirationSeconds,...p}=input;const now=Math.floor(Date.now()/1000)*1000;reply(r.res,200,await serialized(()=>run('normal',{...p,createdAt:iso(now),expiresAt:iso(now+expirationSeconds*1000)})));return;
  }
  const m=/^\/api\/scenarios\/([a-z-]+)\/run$/.exec(r.path);
  if(r.method==='POST'&&m){validate(obj({}),r.json);reply(r.res,200,await serialized(()=>run(m[1],{},true)));return;}
 });return {server,close:async()=>{server.close();}};
}
if(import.meta.url===new URL(process.argv[1],'file://').href)await startAgent();
