import {validate,registrationSchema} from '../shared-schemas/index.ts';
import type {Registration,ModuleConfig} from '../shared-schemas/types.ts';
import {makeModule} from '../verification-core/module.ts';
import {ensure} from '../verification-core/errors.ts';
export function erc8004Filter(config:ModuleConfig){return makeModule('erc8004','ERC-8004',config,[],async c=>{
 const id=c.bundle.claimedIdentity;
 ensure(id.chainId===c.chainId,'CHAIN_NOT_ALLOWED');ensure(id.registry.toLowerCase()===c.registryAddress.toLowerCase(),'REGISTRY_NOT_ALLOWED');
 const snapshot=await c.registryReader.read(id,c.signal);ensure(snapshot,'AGENT_NOT_REGISTERED');
 c.evidence.snapshot=snapshot;
 ensure(snapshot.owner&&snapshot.owner!=='0x0000000000000000000000000000000000000000','OWNER_INVALID');
 const fetched=await c.fetcher.json(snapshot.agentURI,c.signal);c.evidence.registrationSource=fetched;
 const registration=validate<Registration>(registrationSchema,fetched.value);
 ensure(registration.active,'AGENT_INACTIVE');
 const descriptor=`eip155:${id.chainId}:${id.registry}`.toLowerCase();
 ensure(registration.registrations.some(r=>String(r.agentId)===id.agentId&&r.agentRegistry.toLowerCase()===descriptor),'REGISTRATION_AGENT_ID_MISMATCH');
 ensure(registration.agentproof.runtimeBindingHash===snapshot.runtimeBindingHash,'REGISTRATION_BINDING_HASH_MISMATCH');
 c.snapshot=snapshot;c.registration=registration;
 c.evidence.activeSource='off-chain registration file, not an ERC-8004 contract flag';
 c.evidence.currentOwner=snapshot.owner;c.evidence.currentAgentWallet=snapshot.agentWallet;
 return {message:snapshot.source==='simulation'?'개발용 등록부 조회 성공 — 실제 블록체인 조회가 아닙니다.':'고정 블록의 온체인 소유자·URI·키 연결 해시를 조회했습니다.'};
});}
