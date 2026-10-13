import {validate,cardSchema,EXTENSION_URI} from '../shared-schemas/index.ts';
import type {AgentCard,ModuleConfig} from '../shared-schemas/types.ts';
import {hash,canonical,without,inTime,verifyBytes,publicKey} from '../crypto/index.ts';
import {parseJsonStrict} from '../shared-schemas/json.ts';
import {makeModule} from '../verification-core/module.ts';
import {ensure} from '../verification-core/errors.ts';
import {identityEquals} from '../verification-core/context.ts';
export function a2aFilter(config:ModuleConfig){return makeModule('a2a','A2A Agent Card',config,[],async c=>{
 if(!c.snapshot||!c.registration){
  const key=hash(c.bundle.claimedIdentity);const pre=c.trust.pretrustedAgents?.[key];
  if(c.configuration.modules.erc8004.enabled||!pre)return {status:'PARTIAL',reasonCodes:['NO_INDEPENDENT_IDENTITY_ANCHOR'],message:'온체인 또는 관리자 사전 신뢰 기준점이 없습니다.'};
  c.snapshot=pre.snapshot;c.registration=pre.registration;c.evidence.anchor='ADMIN_PINNED_NOT_ONCHAIN';
 }
 const a2a=c.registration.services.filter(s=>s.name==='A2A');ensure(a2a.length===1,'A2A_OFFICIAL_URL_MISSING_OR_AMBIGUOUS');
 const fetched=await c.fetcher.json(a2a[0].endpoint,c.signal);c.evidence.officialSource=fetched;
 const card=validate<AgentCard>(cardSchema,fetched.value);const presented=c.bundle.presentedAgentCard;
 c.evidence.presentedCard=presented;c.evidence.fetchedCard=card;
 c.evidence.presentedHash=hash(presented);c.evidence.fetchedHash=hash(card);
 ensure(hash(presented)===hash(card),'AGENT_CARD_HASH_MISMATCH');
 const ext=card.capabilities.extensions.filter(e=>e.uri===EXTENSION_URI);ensure(ext.length===1&&ext[0].required,'RUNTIME_EXTENSION_MISSING');
 const b=ext[0].params;c.evidence.runtimeBinding=b;
 ensure(identityEquals(b.subjectAgent,c.bundle.claimedIdentity),'CARD_AGENT_ID_MISMATCH');
 ensure(b.ownerWallet.toLowerCase()===c.snapshot.owner.toLowerCase(),'CURRENT_OWNER_MISMATCH');
 ensure(hash(b)===c.snapshot.runtimeBindingHash,'CURRENT_RUNTIME_BINDING_MISMATCH');
 ensure(card.supportedInterfaces[0].url===c.registration.agentproof.runtimeEndpoint&&b.endpoint===card.supportedInterfaces[0].url,'ENDPOINT_MISMATCH');
 ensure(c.allowedVersions.includes(b.programVersion)&&card.version===b.programVersion,'PROGRAM_VERSION_NOT_ALLOWED');
 ensure(inTime(b.issuedAt,b.expiresAt,c.now,0),'STALE_AGENT_CARD');
 publicKey(b.publicKeyMultibase);
 ensure(b.apsAgentId==='did:key:'+b.publicKeyMultibase&&b.runtimeKeyId===b.apsAgentId+'#'+b.publicKeyMultibase,'RUNTIME_KEY_ID_MISMATCH');
 ensure(card.securitySchemes.agentproof?.httpAuthSecurityScheme?.scheme.toLowerCase()==='bearer','SECURITY_SCHEME_MISMATCH');
 ensure(card.securityRequirements.some(r=>r.schemes.agentproof!==undefined),'SECURITY_REQUIREMENT_MISSING');
 // This MVP accepts only EdDSA JWS over its explicitly supported card subset.
 if(card.signatures){
  const unsigned=without(card,'signatures');
  for(const s of card.signatures){
   const h=parseJsonStrict(Buffer.from(s.protected,'base64url')) as Record<string,unknown>;
   ensure(h.alg==='EdDSA'&&h.kid===b.runtimeKeyId&&h.typ==='JOSE'&&Object.keys(h).length===3,'CARD_JWS_HEADER_UNSUPPORTED');
   ensure(verifyBytes(b.publicKeyMultibase,Buffer.from(s.protected+'.'+Buffer.from(canonical(unsigned)).toString('base64url')),s.signature),'CARD_SIGNATURE_INVALID');
  }
 }
 c.binding=b;c.evidence.signature=card.signatures?'verified supported EdDSA JWS':'not present; key binding independently pinned by registry metadata';
 return {expiresAt:b.expiresAt,message:'공식 명함과 제출 명함이 같고, 현재 소유자가 연결한 런타임 키·엔드포인트가 일치합니다.'};
});}
