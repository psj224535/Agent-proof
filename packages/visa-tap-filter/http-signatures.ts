import {createHash} from 'node:crypto';
import {signBytes,verifyBytes,constantEqual} from '../crypto/index.ts';
import type {KeyPair} from '../crypto/index.ts';
import type {Transport} from '../shared-schemas/types.ts';
import {ensure} from '../verification-core/errors.ts';
/** Deliberately strict RFC 9421 application profile, not a general SFV parser.
 * Exactly one signature label, one algorithm and fixed ordered covered components.
 * Unsupported components/parameters/duplicates are rejected, never ignored.
 */
export interface SignatureParameters {created:number;expires:number;nonce:string;keyid:string;tag:'agent-payer-auth'|'agent-browser-auth'}
const COMPONENTS='("@method" "@authority" "@path" "content-digest")';
const WITH_AUTH='("@method" "@authority" "@path" "content-digest" "authorization")';
export function contentDigest(body:Buffer):string {return 'sha-256=:'+createHash('sha256').update(body).digest('base64')+':';}
export function signatureInput(p:SignatureParameters,withAuth=false):string {
 ensure(/^[A-Za-z0-9:._/#-]{1,300}$/.test(p.keyid),'KEYID_FORMAT');ensure(/^[0-9a-f]{32}$/.test(p.nonce),'NONCE_FORMAT');
 return `${withAuth?WITH_AUTH:COMPONENTS};created=${p.created};expires=${p.expires};nonce="${p.nonce}";keyid="${p.keyid}";alg="ed25519";tag="${p.tag}"`;
}
export function signingBase(t:Transport,input:string,withAuth=false):Buffer {
 return Buffer.from([`"@method": ${t.method.toUpperCase()}`,`"@authority": ${t.authority}`,`"@path": ${t.path}`,`"content-digest": ${t.headers['content-digest']}`,...(withAuth?[`"authorization": ${t.headers.authorization}`]:[]),`"@signature-params": ${input}`].join('\n'));
}
export function signHttp(key:KeyPair,t:Transport,p:SignatureParameters,withAuth=false):Record<string,string> {
 const headers={...t.headers,'content-digest':contentDigest(t.rawBody)};const input=signatureInput(p,withAuth);
 return {...headers,'signature-input':'sig1='+input,signature:'sig1=:'+Buffer.from(signBytes(key,signingBase({...t,headers},input,withAuth)),'base64url').toString('base64')+':'};
}
export function parseSignatureInput(value:string,withAuth=false):SignatureParameters {
 const prefix='sig1='+(withAuth?WITH_AUTH:COMPONENTS);
 ensure(value.startsWith(prefix),'TAP_COVERED_COMPONENTS_INVALID');
 const m=/^;created=(\d{1,12});expires=(\d{1,12});nonce="([0-9a-f]{32})";keyid="([A-Za-z0-9:._/#-]{1,300})";alg="ed25519";tag="(agent-payer-auth|agent-browser-auth)"$/.exec(value.slice(prefix.length));
 ensure(m,'TAP_SIGNATURE_INPUT_INVALID');
 return {created:Number(m[1]),expires:Number(m[2]),nonce:m[3],keyid:m[4],tag:m[5] as SignatureParameters['tag']};
}
export function verifyHttp(t:Transport,key:string,keyId:string,now:number,withAuth=false):SignatureParameters {
 const p=parseSignatureInput(t.headers['signature-input']??'',withAuth);
 ensure(p.keyid===keyId,'TAP_KEY_MISMATCH');
 ensure(p.created*1000<=now+30000&&p.expires*1000>now&&p.created<p.expires&&p.expires-p.created<=300,'TAP_EXPIRED_OR_INVALID_TIME');
 ensure(constantEqual(t.headers['content-digest']??'',contentDigest(t.rawBody)),'CONTENT_DIGEST_MISMATCH');
 const m=/^sig1=:([A-Za-z0-9+/]{86}==):$/.exec(t.headers.signature??'');ensure(m,'TAP_SIGNATURE_FORMAT');
 const s=Buffer.from(m[1],'base64');ensure(s.length===64&&s.toString('base64')===m[1],'TAP_SIGNATURE_FORMAT');
 ensure(verifyBytes(key,signingBase(t,signatureInput(p,withAuth),withAuth),s.toString('base64url')),'TAP_SIGNATURE_INVALID');
 return p;
}
