import type {ModuleConfig,CompanyAttestation,TrustStore} from '../shared-schemas/types.ts';
import {validate,obj,S,timeSchema,hashSchema,signatureSchema} from '../shared-schemas/index.ts';
import {makeModule} from '../verification-core/module.ts';
import {ensure} from '../verification-core/errors.ts';
import {identityEquals} from '../verification-core/context.ts';
import {verifyObject,without,inTime,hash} from '../crypto/index.ts';
import type {Fetcher} from '../network/safe-fetch.ts';
const statusSchema=obj({issuer:S,attestationId:S,status:{enum:['ACTIVE','SUSPENDED','REVOKED','EXPIRED','PENDING']},attestationHash:hashSchema,issuedAt:timeSchema,expiresAt:timeSchema,signature:signatureSchema});
export async function checkCompanyStatus(a:CompanyAttestation,trust:TrustStore,fetcher:Fetcher,now:number,signal?:AbortSignal):Promise<Record<string,unknown>>{
 const issuer=trust.issuers[a.issuer];ensure(issuer,'ISSUER_UNTRUSTED');
 ensure(new URL(a.statusUri).origin===issuer.statusOrigin,'COMPANY_STATUS_ORIGIN_MISMATCH');
 const source=await fetcher.json(a.statusUri,signal);const s=validate<Record<string,string>>(statusSchema,source.value);
 ensure(verifyObject(issuer.publicKeyMultibase,'AGENTPROOF-COMPANY-STATUS-V1',without(s,'signature'),s.signature),'COMPANY_STATUS_SIGNATURE_INVALID');
 ensure(s.issuer===a.issuer&&s.attestationId===a.attestationId&&s.attestationHash===hash(a),'COMPANY_STATUS_BINDING_MISMATCH');
 ensure(inTime(s.issuedAt,s.expiresAt,now)&&Date.parse(s.expiresAt)-Date.parse(s.issuedAt)<=60000,'COMPANY_STATUS_STALE');
 ensure(!['REVOKED','SUSPENDED','EXPIRED'].includes(s.status),'COMPANY_'+s.status);
 return {source,status:s.status,testIssuer:issuer.testIssuer};
}
export function companyFilter(config:ModuleConfig){return makeModule('company-attestation','Company Attestation',config,['a2a'],async c=>{
 const a=c.bundle.companyAttestation;if(!a)return {status:'PARTIAL',reasonCodes:['COMPANY_EVIDENCE_MISSING'],message:'회사 확인자료가 없습니다.'};
 c.evidence.presentedAttestation=a;const issuer=c.trust.issuers[a.issuer];ensure(issuer,'ISSUER_UNTRUSTED');
 ensure(verifyObject(issuer.publicKeyMultibase,'AGENTPROOF-COMPANY-ATTESTATION-V1',without(a,'signature'),a.signature),'COMPANY_SIGNATURE_INVALID');
 ensure(identityEquals(a.subjectAgent,c.bundle.claimedIdentity),'COMPANY_AGENT_ID_MISMATCH');
 ensure(c.binding&&c.snapshot,'RUNTIME_KEY_UNRESOLVED');
 ensure(a.ownerWallet.toLowerCase()===c.snapshot.owner.toLowerCase()||(c.snapshot.agentWallet!=='0x0000000000000000000000000000000000000000'&&a.ownerWallet.toLowerCase()===c.snapshot.agentWallet.toLowerCase()),'COMPANY_OWNER_MISMATCH');
 ensure(a.runtimeKeyId===c.binding.runtimeKeyId,'COMPANY_RUNTIME_KEY_MISMATCH');
 ensure(a.endpoint===c.binding.endpoint&&a.programVersion===c.binding.programVersion,'COMPANY_ENDPOINT_OR_VERSION_MISMATCH');
 ensure(inTime(a.validFrom,a.expiresAt,c.now,0),'COMPANY_EXPIRED');ensure(a.status==='ACTIVE','COMPANY_'+a.status);
 const status=await checkCompanyStatus(a,c.trust,c.fetcher,c.now,c.signal);c.evidence.status=status;
 if(status.status==='PENDING')return {status:'PARTIAL',reasonCodes:['COMPANY_MANUAL_REVIEW'],message:'테스트 발급자에서 수동 검토 중입니다.'};
 return {expiresAt:a.expiresAt,message:issuer.testIssuer?'테스트 발급자의 서명과 상태를 확인했습니다. 실제 기업 KYC는 아닙니다.':'신뢰한 발급자의 서명과 최신 상태를 확인했습니다.'};
});}
