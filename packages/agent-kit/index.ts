import {randomUUID} from 'node:crypto';
import {keyPair,hash,iso,randomHex,signObject,canonical,signBytes} from '../crypto/index.ts';
import type {KeyPair} from '../crypto/index.ts';
import type {AgentCard,Registration,RegistrySnapshot,RuntimeBinding,Passport,CompanyAttestation,Identity,Presentation,Purchase,Transport,Challenge} from '../shared-schemas/types.ts';
import {EXTENSION_URI,AUTH_PATH,MOCK_PATH} from '../shared-schemas/index.ts';
import {createPassport,bundleHash,signChallenge} from '../aps-passport-filter/passport.ts';
import {signHttp} from '../visa-tap-filter/http-signatures.ts';
export const SIM_REGISTRY='0x0000000000000000000000000000000000008004';
export const TEST_ISSUER='did:web:agentproof-test-issuer';
export interface AgentDocuments {identity:Identity;key:KeyPair;ownerKey:KeyPair;card:AgentCard;passport:Passport;registration:Registration;binding:RuntimeBinding;snapshot:RegistrySnapshot;attestation?:CompanyAttestation}
export function createDocuments(input:{agentOrigin:string;agentId?:string;ownerKey?:KeyPair;key?:KeyPair;now?:number;chainId?:number;registry?:string}):AgentDocuments {
 const now=input.now??Date.now(),key=input.key??keyPair(),ownerKey=input.ownerKey??keyPair();
 const identity:Identity={chainId:input.chainId??31337,registry:input.registry??SIM_REGISTRY,agentId:input.agentId??'1'};
 // Development mock address ONLY; this is NOT an Ethereum wallet derivation.
 const owner='0x'+hash(ownerKey.publicKeyMultibase).slice(0,40);
 const endpoint=input.agentOrigin+'/a2a';
 const binding:RuntimeBinding={subjectAgent:identity,ownerWallet:owner,runtimeKeyId:key.keyId,publicKeyMultibase:key.publicKeyMultibase,apsAgentId:key.did,endpoint,programVersion:'1.0.0',issuedAt:iso(now),expiresAt:iso(now+3600000)};
 const unsigned:AgentCard={name:'AgentProof Shopping Agent',description:'CS40008 authentication research demo; no live payments.',version:'1.0.0',provider:{organization:'PILAB test operator (unverified legal identity)',url:input.agentOrigin},supportedInterfaces:[{url:endpoint,protocolBinding:'HTTP+JSON',protocolVersion:'1.0'}],capabilities:{extensions:[{uri:EXTENSION_URI,required:true,params:binding}],streaming:false,pushNotifications:false},defaultInputModes:['application/json'],defaultOutputModes:['application/json'],skills:[{id:'purchase-request',name:'Mock purchase request',description:'Request access to a protected simulation API.',tags:['simulation']}],securitySchemes:{agentproof:{httpAuthSecurityScheme:{scheme:'Bearer',bearerFormat:'AgentProof authentication ticket'}}},securityRequirements:[{schemes:{agentproof:{list:[]}}}]};
 const header=Buffer.from(canonical({alg:'EdDSA',kid:key.keyId,typ:'JOSE'})).toString('base64url');
 const card={...unsigned,signatures:[{protected:header,signature:signBytes(key,Buffer.from(header+'.'+Buffer.from(canonical(unsigned)).toString('base64url')))}]};
 const registration:Registration={type:'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',name:card.name,description:card.description,image:input.agentOrigin+'/agent.svg',active:true,services:[{name:'A2A',endpoint:input.agentOrigin+'/.well-known/agent-card.json',version:'1.0'}],registrations:[{agentId:Number(identity.agentId),agentRegistry:`eip155:${identity.chainId}:${identity.registry}`}],agentproof:{runtimeBindingHash:hash(binding),runtimeEndpoint:endpoint}};
 const snapshot:RegistrySnapshot={identity,owner,agentWallet:owner,agentURI:input.agentOrigin+'/.well-known/agent-registration.json',runtimeBindingHash:hash(binding),blockNumber:'1',blockHash:hash({identity,owner,binding}),abiVersion:'SIMULATION-NOT-ERC8004-CHAIN',source:'simulation'};
 return {identity,key,ownerKey,card,passport:createPassport(key,now),registration,binding,snapshot};
}
export function createAttestation(d:AgentDocuments,issuerKey:KeyPair,issuerOrigin:string,now=Date.now()):CompanyAttestation {
 const id=randomUUID();const a={attestationId:id,issuer:TEST_ISSUER,subjectAgent:d.identity,operatorCompanyId:'pilab-test',responsibleUserId:'test-operator',ownerWallet:d.binding.ownerWallet,runtimeKeyId:d.binding.runtimeKeyId,endpoint:d.binding.endpoint,programVersion:d.binding.programVersion,validFrom:iso(now),expiresAt:iso(now+3600000),status:'ACTIVE' as const,statusUri:issuerOrigin+'/status/'+id};
 return {...a,signature:signObject(issuerKey,'AGENTPROOF-COMPANY-ATTESTATION-V1',a)};
}
export function statusDocument(a:CompanyAttestation,key:KeyPair,status='ACTIVE',now=Date.now()):object{
 const body={issuer:a.issuer,attestationId:a.attestationId,status,attestationHash:hash(a),issuedAt:iso(now),expiresAt:iso(now+30000)};
 return {...body,signature:signObject(key,'AGENTPROOF-COMPANY-STATUS-V1',body)};
}
export function presentation(d:AgentDocuments,audience:string,now=Date.now(),purchase:Partial<Purchase>={}):Presentation {
 const sec=Math.floor(now/1000)*1000;
 const p:Presentation={presentationVersion:'agentproof-presentation-v1',requestId:randomUUID(),claimedIdentity:structuredClone(d.identity),presentedAgentCard:structuredClone(d.card),presentedPassport:structuredClone(d.passport),tapRequest:{merchant:audience,purpose:'payment',productId:'shoe-001',amount:179000,currency:'KRW',quantity:1,createdAt:iso(sec),expiresAt:iso(sec+120000),nonce:randomHex(),...purchase},submittedAt:iso(now),bundleHash:''};
 if(d.attestation)p.companyAttestation=structuredClone(d.attestation);
 p.bundleHash=bundleHash(p);return p;
}
export function addProof(p:Presentation,ch:Challenge,key:KeyPair):void {p.passportProof={challengeId:ch.challengeId,signature:signChallenge(key,ch)};}
export function authenticateTransport(p:Presentation,key:KeyPair,audience:string):Transport {
 const t:Transport={method:'POST',authority:audience,path:AUTH_PATH,rawBody:Buffer.from(JSON.stringify(p)),headers:{'content-type':'application/json'}};
 t.headers=signHttp(key,t,{created:Math.floor(Date.parse(p.tapRequest.createdAt)/1000),expires:Math.floor(Date.parse(p.tapRequest.expiresAt)/1000),nonce:p.tapRequest.nonce,keyid:key.keyId,tag:p.tapRequest.purpose==='payment'?'agent-payer-auth':'agent-browser-auth'});return t;
}
export function protectedTransport(p:Presentation,token:string,key:KeyPair,audience:string,now=Date.now()):Transport {
 const t:Transport={method:'POST',authority:audience,path:MOCK_PATH,rawBody:Buffer.from(JSON.stringify(p.tapRequest)),headers:{'content-type':'application/json',authorization:'Bearer '+token}};
 t.headers=signHttp(key,t,{created:Math.floor(now/1000),expires:Math.floor(now/1000)+60,nonce:randomHex(),keyid:key.keyId,tag:p.tapRequest.purpose==='payment'?'agent-payer-auth':'agent-browser-auth'},true);return t;
}
