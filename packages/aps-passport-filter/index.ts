import type {ModuleConfig} from '../shared-schemas/types.ts';
import {makeModule} from '../verification-core/module.ts';
import {ensure} from '../verification-core/errors.ts';
import {identityEquals} from '../verification-core/context.ts';
import {verifyPassport,verifyChallenge} from './passport.ts';
import {inTime} from '../crypto/index.ts';
export function apsFilter(config:ModuleConfig){return makeModule('aps-passport','APS Passport',config,['a2a'],async c=>{
 const p=c.bundle.presentedPassport;
 if(!p)return {status:'PARTIAL',reasonCodes:['PASSPORT_MISSING'],message:'Passport가 없습니다.'};
 c.evidence.presentedPassport=p;verifyPassport(p,c.now);ensure(c.binding,'RUNTIME_KEY_UNRESOLVED');
 ensure(p.agent_id===c.binding.apsAgentId,'PASSPORT_AGENT_ID_MISMATCH');
 ensure(p.public_key_multibase===c.binding.publicKeyMultibase&&p.verification_method===c.binding.runtimeKeyId,'PASSPORT_RUNTIME_KEY_MISMATCH');
 const proof=c.bundle.passportProof;ensure(proof,'PASSPORT_CHALLENGE_MISSING');const stored=await c.store.getChallenge(proof.challengeId);ensure(stored,'CHALLENGE_UNKNOWN');
 const ch=stored.challenge;c.evidence.challenge=ch;ensure(stored.consumedAt===null,'CHALLENGE_REPLAY');
 ensure(inTime(ch.issuedAt,ch.expiresAt,c.now,0),'CHALLENGE_EXPIRED');
 ensure(ch.audience===c.audience&&ch.operation==='mock-purchase','CHALLENGE_AUDIENCE_MISMATCH');
 ensure(identityEquals(ch.subjectAgent,c.bundle.claimedIdentity)&&ch.runtimeKeyId===c.binding.runtimeKeyId,'CHALLENGE_IDENTITY_MISMATCH');
 ensure(ch.requestHash===c.bundle.bundleHash&&ch.requestId===c.bundle.requestId,'CHALLENGE_REQUEST_MISMATCH');
 ensure(verifyChallenge(p.public_key_multibase,ch,proof.signature),'PASSPORT_CHALLENGE_INVALID');
 c.challengeId=ch.challengeId;c.evidence.proofOfPossession=true;c.evidence.keyAuthority='current registry-bound A2A runtime identity';c.evidence.capabilities='self-asserted, not functionally validated';
 return {expiresAt:p.expires_at,message:'Passport 서명·기간·키 연결과 현재 요청의 challenge-response를 검증했습니다.'};
});}
