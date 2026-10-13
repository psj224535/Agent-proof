import {randomUUID} from 'node:crypto';
import type {KeyPair} from '../crypto/index.ts';
import {hash,without,iso,randomHex,signBytes,verifyBytes,canonical} from '../crypto/index.ts';
import type {Context,RegistryReader,VerificationModule} from './context.ts';
import {identityScope} from './context.ts';
import {aggregate} from './config.ts';
import {skipped} from './module.ts';
import {ensure,VerificationFailure,SourceUnavailable} from './errors.ts';
import {MODULE_IDS} from '../shared-schemas/types.ts';
import type {Presentation,Transport,TrustStore,AuthenticationResult,Challenge,ModuleId,Purchase,Configuration,RegistrySnapshot,CompanyAttestation} from '../shared-schemas/types.ts';
import {validate,parseJsonStrict,presentationSchema,challengeRequestSchema,purchaseSchema,MOCK_PATH} from '../shared-schemas/index.ts';
import type {Fetcher} from '../network/safe-fetch.ts';
import type {Store} from '../storage/store.ts';
import {bundleHash} from '../aps-passport-filter/passport.ts';
import {erc8004Filter} from '../erc8004-filter/index.ts';
import {a2aFilter} from '../a2a-filter/index.ts';
import {apsFilter} from '../aps-passport-filter/index.ts';
import {companyFilter,checkCompanyStatus} from '../company-filter/index.ts';
import {tapFilter} from '../visa-tap-filter/index.ts';
import {verifyHttp} from '../visa-tap-filter/http-signatures.ts';
export interface EngineOptions {store:Store;fetcher:Fetcher;registryReader:RegistryReader;trust:TrustStore;ticketKey:KeyPair;audience:string;chainId:number;registryAddress:string;development:boolean;now?:()=>number}
export interface TicketClaims {
 iss:string;sub:string;aud:string;iat:number;exp:number;jti:string;traceId:string;
 subjectAgent:Presentation['claimedIdentity'];assuranceProfile:string;policyProfile:string;
 enabledModules:ModuleId[];evidenceBundleHash:string;currentKeyId:string;publicKeyMultibase:string;
 allowedOperation:'mock-purchase';requestHash:string;configurationVersion:number;
 development:boolean;anchor:RegistrySnapshot;companyAttestation?:CompanyAttestation;
}
const names:Record<ModuleId,string>={erc8004:'ERC8004',a2a:'A2A','aps-passport':'PASSPORT','company-attestation':'COMPANY_ATTESTATION','visa-tap':'TAP_SIGNATURE'};
export class Verifier {
 options:EngineOptions;now:()=>number;
 constructor(options:EngineOptions){this.options=options;this.now=options.now??Date.now;}
 async challenge(value:unknown):Promise<Challenge>{
  const v=validate<{subjectAgent:Presentation['claimedIdentity'];runtimeKeyId:string;requestId:string;requestHash:string}>(challengeRequestSchema,value);
  const now=this.now();const ch:Challenge={...v,challengeId:randomUUID(),nonce:randomHex(32),audience:this.options.audience,operation:'mock-purchase',issuedAt:iso(now),expiresAt:iso(now+120000)};
  await this.options.store.challenge(ch);return ch;
 }
 async authenticate(bundle:Presentation,transport:Transport):Promise<AuthenticationResult>{
  validate(presentationSchema,bundle);
  ensure(hash(parseJsonStrict(transport.rawBody))===hash(bundle),'TRANSPORT_BODY_MISMATCH');
  const o=this.options,now=this.now(),configuration=structuredClone(await o.store.configuration());
  const traceId=await o.store.newTrace(bundle.claimedIdentity,now);
  const requestEvidence=await o.store.saveEvidence({bundle,transport:{method:transport.method,path:transport.path,authority:transport.authority,bodyHash:hash(bundle),headers:transport.headers}});
  await o.store.audit(traceId,'REQUEST_RECEIVED',{input:{bundleHash:bundle.bundleHash},references:[requestEvidence],configuration,now});
  const context:Context={bundle,transport,configuration,store:o.store,fetcher:o.fetcher,registryReader:o.registryReader,trust:o.trust,chainId:o.chainId,registryAddress:o.registryAddress,audience:o.audience,allowedVersions:['1.0.0'],now,traceId,signal:new AbortController().signal,evidence:{},results:[]};
  const mods=[erc8004Filter(configuration.modules.erc8004),a2aFilter(configuration.modules.a2a),apsFilter(configuration.modules['aps-passport']),companyFilter(configuration.modules['company-attestation']),tapFilter(configuration.modules['visa-tap'])];
  const envelopeGood=bundleHash(bundle)===bundle.bundleHash;
  let stopped=!envelopeGood;
  for(const mod of mods){
   let r;
   if(!mod.enabled)r=skipped(mod.id,context,'DISABLED_BY_ADMIN');
   else if(stopped)r=skipped(mod.id,context,'EARLY_STOP');
   else if(mod.dependencies.some(id=>context.results.find(x=>x.moduleId===id)?.status!=='PASS'))r=skipped(mod.id,context,'DEPENDENCY_NOT_VERIFIED');
   else {
    await o.store.audit(traceId,names[mod.id]+'_CHECK_STARTED',{moduleId:mod.id,now:this.now()});
    const local:Context={...context,evidence:{},signal:AbortSignal.timeout(configuration.modules[mod.id].timeoutMs)};
    // A timed-out module gets an isolated context; a late resolution cannot alter accepted state.
    let timer:ReturnType<typeof setTimeout>;
    const timeout=new Promise<ReturnType<VerificationModule['verify']> extends Promise<infer T>?T:never>(resolve=>{
     timer=setTimeout(()=>{const base=skipped(mod.id,context,'MODULE_TIMEOUT');const body={...without(base,'outputHash'),status:'ERROR',humanReadableReason:'독립 검증 시간이 초과되었습니다.'};resolve({...body,outputHash:hash(body)} as typeof base);},configuration.modules[mod.id].timeoutMs);
    });
    r=await Promise.race([mod.verify(local),timeout]);clearTimeout(timer!);
    if(r.status==='PASS')for(const k of ['snapshot','registration','binding','challengeId','tap'] as const){if(local[k]!==undefined)(context as any)[k]=local[k];}
   }
   context.results.push(r);
   const evidence=await o.store.saveEvidence(r.evidence);
   await o.store.audit(traceId,names[mod.id]+'_CHECK_COMPLETED',{moduleId:mod.id,input:r.inputHash,output:r.outputHash,reasonCodes:r.reasonCodes,references:[evidence],now:this.now()});
   if(mod.id==='a2a'&&r.status==='PASS')await o.store.audit(traceId,'A2A_CARD_COMPARED',{moduleId:mod.id,output:r.outputHash});
   if(mod.id==='aps-passport'&&r.status==='PASS'){
    await o.store.audit(traceId,'PASSPORT_CHALLENGE_ISSUED',{moduleId:mod.id,output:{challengeId:context.challengeId},now:Date.parse((r.evidence as any).challenge.issuedAt)});
    await o.store.audit(traceId,'PASSPORT_PROOF_VERIFIED',{moduleId:mod.id,output:r.outputHash});
   }
   if(configuration.mode==='failFast'&&mod.required&&r.status==='FAIL')stopped=true;
  }
  const decision=aggregate(configuration,context.results);
  const result:AuthenticationResult={traceId,...decision,assuranceProfile:o.development?'DEVELOPMENT_MINIMAL':decision.policyProfile,development:o.development,enabledModules:MODULE_IDS.filter(id=>configuration.modules[id].enabled),skippedModules:context.results.filter(r=>r.status==='SKIP').map(r=>r.moduleId),evidenceBundleHash:hash(context.results.map(r=>r.outputHash)),modules:context.results};
  if(!envelopeGood){result.verdict='REJECT';result.reasonCodes=['BUNDLE_HASH_MISMATCH'];}
  if(result.verdict==='VERIFIED'){
   try{
    ensure(context.binding&&context.snapshot&&context.tap,'MISSING_AUTHENTICATED_BINDING');
    if(!o.development){
     ensure(context.snapshot.source!=='simulation','SIMULATION_CANNOT_PROVE_PRODUCTION_IDENTITY');
     if(bundle.companyAttestation&&context.results.some(r=>r.moduleId==='company-attestation'&&r.status==='PASS'))ensure(!o.trust.issuers[bundle.companyAttestation.issuer]?.testIssuer,'TEST_ISSUER_CANNOT_PROVE_PRODUCTION_COMPANY');
    }
    // Tickets never outlive any accepted source or the signed request.
    const expiresAt=Math.min(this.now()+300000,...context.results.filter(r=>r.status==='PASS'&&r.expiresAt).map(r=>Date.parse(r.expiresAt!)));
    ensure(expiresAt>this.now(),'EVIDENCE_EXPIRED_DURING_VERIFICATION');
    const claims:TicketClaims={iss:'agentproof:'+o.audience,sub:identityScope(context),aud:o.audience,iat:Math.floor(this.now()/1000),exp:Math.floor(expiresAt/1000),jti:randomUUID(),traceId,subjectAgent:bundle.claimedIdentity,assuranceProfile:result.assuranceProfile,policyProfile:result.policyProfile,enabledModules:result.enabledModules,evidenceBundleHash:result.evidenceBundleHash,currentKeyId:context.binding.runtimeKeyId,publicKeyMultibase:context.binding.publicKeyMultibase,allowedOperation:'mock-purchase',requestHash:hash(bundle.tapRequest),configurationVersion:configuration.version,development:o.development,anchor:context.snapshot};
    if(context.results.some(r=>r.moduleId==='company-attestation'&&r.status==='PASS'))claims.companyAttestation=bundle.companyAttestation;
    const token=this.encodeTicket(claims);
    await o.store.commitAuthentication({scope:identityScope(context),nonce:context.tap.nonce,requestId:bundle.requestId,traceId,expiresAt:Date.parse(bundle.tapRequest.expiresAt),now:this.now(),challengeId:context.challengeId,ticket:{jti:claims.jti,hash:hash(token),expiresAt:claims.exp*1000}});
    result.ticket=token;result.ticketExpiresAt=iso(claims.exp*1000);
   }catch(e){result.verdict=e instanceof VerificationFailure?'REJECT':'PARTIAL';result.reasonCodes=[e instanceof VerificationFailure?e.code:'PERSISTENCE_UNAVAILABLE'];}
  }
  await o.store.audit(traceId,'FINAL_IDENTITY_DECIDED',{output:without(result,'ticket'),reasonCodes:result.reasonCodes});
  if(result.ticket)await o.store.audit(traceId,'AUTH_TICKET_ISSUED',{output:{tokenHash:hash(result.ticket),expiresAt:result.ticketExpiresAt}});
  await o.store.saveResult(result);return result;
 }
 encodeTicket(c:TicketClaims):string {
  const h=Buffer.from(canonical({alg:'EdDSA',typ:'agentproof-auth+jwt',kid:this.options.ticketKey.keyId})).toString('base64url');
  const p=Buffer.from(canonical(c)).toString('base64url');return h+'.'+p+'.'+signBytes(this.options.ticketKey,Buffer.from(h+'.'+p));
 }
 decodeTicket(token:string):TicketClaims {
  ensure(token.length<20000,'TICKET_TOO_LARGE');const parts=token.split('.');ensure(parts.length===3,'TICKET_FORMAT');
  let h:any,p:any;try{h=parseJsonStrict(Buffer.from(parts[0],'base64url'));p=parseJsonStrict(Buffer.from(parts[1],'base64url'));}catch{throw new VerificationFailure('TICKET_FORMAT');}
  ensure(h.alg==='EdDSA'&&h.typ==='agentproof-auth+jwt'&&h.kid===this.options.ticketKey.keyId&&Object.keys(h).length===3,'TICKET_HEADER');
  ensure(verifyBytes(this.options.ticketKey.publicKeyMultibase,Buffer.from(parts[0]+'.'+parts[1]),parts[2]),'TICKET_SIGNATURE_INVALID');
  ensure(p.iss==='agentproof:'+this.options.audience&&p.aud===this.options.audience&&p.allowedOperation==='mock-purchase','TICKET_AUDIENCE_OR_OPERATION');
  ensure(p.development===this.options.development,'TICKET_DEVELOPMENT_MISMATCH');
  ensure(Number.isSafeInteger(p.iat)&&Number.isSafeInteger(p.exp)&&p.exp>p.iat&&p.exp-p.iat<=300&&p.iat*1000<=this.now()+30000&&p.exp*1000>this.now(),'TICKET_EXPIRED');
  return p as TicketClaims;
 }
 async protectedPurchase(t:Transport):Promise<object>{
  ensure(t.method==='POST'&&t.path===MOCK_PATH&&t.authority===this.options.audience,'PROTECTED_TARGET_MISMATCH');
  const token=t.headers.authorization?.replace(/^Bearer /,'');ensure(token&&t.headers.authorization==='Bearer '+token,'TICKET_REQUIRED');
  const c=this.decodeTicket(token),now=this.now();
  const purchase=validate<Purchase>(purchaseSchema,parseJsonStrict(t.rawBody));ensure(hash(purchase)===c.requestHash,'TICKET_ACTION_MISMATCH');
  const sig=verifyHttp(t,c.publicKeyMultibase,c.currentKeyId,now,true);
  ensure(sig.tag===(purchase.purpose==='payment'?'agent-payer-auth':'agent-browser-auth'),'PROTECTED_PURPOSE_MISMATCH');
  ensure((await this.options.store.configuration()).version===c.configurationVersion,'CONFIGURATION_CHANGED_REAUTHENTICATE');
  // Re-check the independent identity anchor before one-time consumption.
  const snapshot=c.enabledModules.includes('erc8004')?await this.options.registryReader.read(c.subjectAgent):this.options.trust.pretrustedAgents?.[hash(c.subjectAgent)]?.snapshot;
  ensure(snapshot&&snapshot.owner.toLowerCase()===c.anchor.owner.toLowerCase()&&snapshot.runtimeBindingHash===c.anchor.runtimeBindingHash,'CURRENT_IDENTITY_CHANGED_REAUTHENTICATE');
  if(c.companyAttestation)await checkCompanyStatus(c.companyAttestation,this.options.trust,this.options.fetcher,now);
  await this.options.store.consumeTicket(c.jti,hash(token),now);
  const receipt={operation:'mock-purchase',authenticated:true,executed:false,paymentExecuted:false,policyEvaluated:false,development:this.options.development,traceId:c.traceId,receiptId:randomUUID(),productId:purchase.productId,message:'보호된 모의 API 접근만 성공했습니다. 결제나 구매 권한 정책은 실행하지 않았습니다.'};
  await this.options.store.audit(c.traceId,'PROTECTED_RESOURCE_ACCESSED',{input:{actionHash:hash(purchase),ticketId:c.jti},output:receipt});return receipt;
 }
}
