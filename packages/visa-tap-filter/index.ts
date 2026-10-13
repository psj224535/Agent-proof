import type {ModuleConfig} from '../shared-schemas/types.ts';
import {makeModule} from '../verification-core/module.ts';
import {ensure} from '../verification-core/errors.ts';
import {identityScope} from '../verification-core/context.ts';
import {verifyHttp} from './http-signatures.ts';
import {AUTH_PATH} from '../shared-schemas/index.ts';
import {inTime} from '../crypto/index.ts';
export function tapFilter(config:ModuleConfig){return makeModule('visa-tap','Visa TAP Request',config,['a2a'],async c=>{
 ensure(c.binding,'RUNTIME_KEY_UNRESOLVED');const p=c.bundle.tapRequest;
 c.evidence.actualRequest={method:c.transport.method,authority:c.transport.authority,path:c.transport.path};c.evidence.presentedPurchase=p;
 ensure(c.transport.method==='POST','TAP_METHOD_MISMATCH');ensure(c.transport.path===AUTH_PATH,'TAP_PATH_MISMATCH');
 ensure(c.transport.authority===c.audience&&p.merchant===c.audience,'TAP_MERCHANT_MISMATCH');
 const params=verifyHttp(c.transport,c.binding.publicKeyMultibase,c.binding.runtimeKeyId,c.now);c.evidence.signatureParameters=params;
 ensure(inTime(p.createdAt,p.expiresAt,c.now),'TAP_PAYLOAD_TIME_INVALID');
 ensure(Math.floor(Date.parse(p.createdAt)/1000)===params.created&&Math.floor(Date.parse(p.expiresAt)/1000)===params.expires,'TAP_PAYLOAD_TIME_MISMATCH');
 ensure(p.nonce===params.nonce,'TAP_NONCE_MISMATCH');ensure(params.tag===(p.purpose==='payment'?'agent-payer-auth':'agent-browser-auth'),'TAP_PURPOSE_MISMATCH');
 ensure(!(await c.store.hasNonce(identityScope(c),params.nonce)),'NONCE_REPLAY');
 c.tap=params;c.evidence.simulationNotice='TAP-compatible simulation; not Visa certification';c.evidence.signatureCovers='actual raw HTTP body, method, authority and path';
 return {expiresAt:p.expiresAt,message:'현재 HTTP 요청의 서명·본문·판매처·경로·시간·nonce를 검증했습니다.'};
});}
