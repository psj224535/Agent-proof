import {canonical,hash,sha256,without,domainBytes,signBytes,verifyBytes,publicKey,inTime,iso,randomHex} from '../crypto/index.ts';
import type {KeyPair} from '../crypto/index.ts';
import {validate,passportSchema} from '../shared-schemas/index.ts';
import type {Passport,Challenge} from '../shared-schemas/types.ts';
import {ensure} from '../verification-core/errors.ts';
export function createPassport(key:KeyPair,now=Date.now(),ttlMs=3600000):Passport {
 const body={record_type:'aps.agent-passport' as const,version:'2.0' as const,agent_id:key.did,verification_method:key.keyId,public_key_multibase:key.publicKeyMultibase,issued_at:iso(now),expires_at:iso(now+ttlMs),nonce:randomHex(),self_asserted:{display_name:'Shopping Agent',capabilities:['product_search','purchase_request']}};
 const withId={...body,passport_id:sha256(domainBytes('APS-PASSPORT-ID-V2',body))};
 return {...withId,signature:signBytes(key,domainBytes('APS-PASSPORT-SIG-V2',withId))};
}
export function verifyPassport(p:Passport,now:number):void {
 validate(passportSchema,p);publicKey(p.public_key_multibase);
 ensure(p.agent_id==='did:key:'+p.public_key_multibase,'PASSPORT_AGENT_ID_MISMATCH');
 ensure(p.verification_method===p.agent_id+'#'+p.public_key_multibase,'PASSPORT_KEY_AUTHORITY_MISMATCH');
 const caps=p.self_asserted.capabilities;
 ensure(new Set(caps).size===caps.length&&canonical(caps)===canonical([...caps].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)))),'PASSPORT_CAPABILITIES_NOT_CANONICAL');
 ensure(p.passport_id===sha256(domainBytes('APS-PASSPORT-ID-V2',without(p,'passport_id','signature'))),'PASSPORT_ID_MISMATCH');
 ensure(verifyBytes(p.public_key_multibase,domainBytes('APS-PASSPORT-SIG-V2',without(p,'signature')),p.signature),'PASSPORT_SIGNATURE_INVALID');
 ensure(inTime(p.issued_at,p.expires_at,now,0),'PASSPORT_EXPIRED_OR_NOT_YET_VALID');
}
export function signChallenge(key:KeyPair,challenge:Challenge):string {return signBytes(key,domainBytes('AGENTPROOF-CHALLENGE-V1',challenge));}
export function verifyChallenge(key:string,c:Challenge,sig:string):boolean {return verifyBytes(key,domainBytes('AGENTPROOF-CHALLENGE-V1',c),sig);}
export function bundleHash(bundle:object):string {return hash(without(bundle,'bundleHash','passportProof'));}
