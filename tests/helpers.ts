import {SQLite} from '../packages/storage/sql.ts';
import {Store} from '../packages/storage/store.ts';
import {Verifier} from '../packages/verification-core/engine.ts';
import {keyPair,sha256} from '../packages/crypto/index.ts';
import {createDocuments,createAttestation,statusDocument,presentation,authenticateTransport,addProof,TEST_ISSUER} from '../packages/agent-kit/index.ts';
import type {Fetcher} from '../packages/network/safe-fetch.ts';
import {SourceUnavailable} from '../packages/verification-core/errors.ts';
import {bundleHash} from '../packages/aps-passport-filter/passport.ts';
import type {Presentation} from '../packages/shared-schemas/types.ts';
export async function fixture(path=':memory:'){
 const clock={now:Date.parse('2026-10-13T12:00:00.000Z')};const issuer=keyPair(),ticketKey=keyPair();
 const d=createDocuments({agentOrigin:'https://agent.test',now:clock.now});d.attestation=createAttestation(d,issuer,'https://issuer.test',clock.now);
 const flags={unregistered:false,status:'ACTIVE',registrationFailure:false,cardFailure:false,companyFailure:false,rpcFailure:false};
 const store=new Store(new SQLite(path));await store.init();
 const fetcher:Fetcher={async json(url){let value:unknown;
  if(url===d.snapshot.agentURI){if(flags.registrationFailure)throw new SourceUnavailable();value=d.registration;}
  else if(url===d.registration.services[0].endpoint){if(flags.cardFailure)throw new SourceUnavailable();value=d.card;}
  else if(url===d.attestation!.statusUri){if(flags.companyFailure)throw new SourceUnavailable();value=statusDocument(d.attestation!,issuer,flags.status,clock.now);}
  else throw new SourceUnavailable();
  const bytes=JSON.stringify(value);return {value:JSON.parse(bytes),sourceUrl:url,sourceHash:sha256(bytes),fetchedAt:new Date(clock.now).toISOString()};
 }};
 const registryReader={async read(id:any){if(flags.rpcFailure)throw new SourceUnavailable('RPC_UNAVAILABLE');return flags.unregistered||id.agentId!==d.identity.agentId?null:structuredClone(d.snapshot);}};
 const trust={issuers:{[TEST_ISSUER]:{publicKeyMultibase:issuer.publicKeyMultibase,statusOrigin:'https://issuer.test',testIssuer:true}}};
 const verifier=new Verifier({store,fetcher,registryReader,trust,ticketKey,audience:'merchant.test',chainId:d.identity.chainId,registryAddress:d.identity.registry,development:true,now:()=>clock.now});
 async function prepare(edit?:(p:Presentation)=>void){const p=presentation(d,'merchant.test',clock.now);edit?.(p);p.bundleHash=bundleHash(p);const ch=await verifier.challenge({subjectAgent:p.claimedIdentity,runtimeKeyId:d.key.keyId,requestId:p.requestId,requestHash:p.bundleHash});addProof(p,ch,d.key);return {p,t:authenticateTransport(p,d.key,'merchant.test'),ch};}
 async function run(edit?:(p:Presentation)=>void){const {p,t}=await prepare(edit);return {result:await verifier.authenticate(p,t),p,t};}
 return {d,store,verifier,flags,clock,issuer,trust,ticketKey,fetcher,registryReader,prepare,run,close:()=>store.close()};
}
