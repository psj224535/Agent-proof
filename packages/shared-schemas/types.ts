export type Json = null | boolean | number | string | Json[] | {[key:string]: Json};
export type JsonObject = {[key:string]: Json};
export type ModuleId = 'erc8004' | 'a2a' | 'aps-passport' | 'company-attestation' | 'visa-tap';
export const MODULE_IDS: ModuleId[] = ['erc8004','a2a','aps-passport','company-attestation','visa-tap'];
export type Status = 'PASS' | 'PARTIAL' | 'FAIL' | 'SKIP' | 'ERROR';
export type Verdict = 'VERIFIED' | 'PARTIAL' | 'REJECT';
export type Profile = 'FULL_AUTH_V1' | 'WEB3_AGENT_V1' | 'EXPERIMENTAL_APS_V1' | 'CUSTOM_REDUCED' | 'DEVELOPMENT_MINIMAL' | 'SEPOLIA_TESTNET';
export interface Identity { chainId: number; registry: string; agentId: string }
export interface RuntimeBinding {
  subjectAgent: Identity; ownerWallet: string; runtimeKeyId: string;
  publicKeyMultibase: string; apsAgentId: string; endpoint: string;
  programVersion: string; issuedAt: string; expiresAt: string;
}
export interface AgentCard {
  name: string; description: string; version: string;
  provider: {organization:string;url:string};
  supportedInterfaces: {url:string;protocolBinding:string;protocolVersion:string}[];
  capabilities: {extensions:{uri:string;required:boolean;params:RuntimeBinding}[]; streaming?:boolean;pushNotifications?:boolean};
  defaultInputModes:string[]; defaultOutputModes:string[];
  skills:{id:string;name:string;description:string;tags:string[]}[];
  securitySchemes: {[key:string]: {httpAuthSecurityScheme:{scheme:string;bearerFormat?:string}}};
  securityRequirements: {schemes:{[key:string]:{list:string[]}}}[];
  signatures?:{protected:string;signature:string}[];
}
export interface Passport {
  record_type:'aps.agent-passport'; version:'2.0'; passport_id:string;
  agent_id:string; verification_method:string; public_key_multibase:string;
  issued_at:string; expires_at:string; nonce:string;
  self_asserted:{display_name?:string;capabilities:string[]}; signature:string;
}
export interface CompanyAttestation {
  attestationId:string;issuer:string;subjectAgent:Identity;
  operatorCompanyId:string;responsibleUserId:string;ownerWallet:string;
  runtimeKeyId:string;endpoint:string;programVersion:string;
  validFrom:string;expiresAt:string;status:'ACTIVE'|'SUSPENDED'|'REVOKED'|'EXPIRED';statusUri:string;signature:string;
}
export interface Purchase {
  merchant:string; purpose:'payment'|'browsing';productId:string;
  amount:number;currency:'KRW';quantity:number;createdAt:string;expiresAt:string;nonce:string;
}
export interface Presentation {
  presentationVersion:'agentproof-presentation-v1';requestId:string;
  claimedIdentity:Identity;presentedAgentCard:AgentCard;
  presentedPassport?:Passport;companyAttestation?:CompanyAttestation;
  tapRequest:Purchase;submittedAt:string;bundleHash:string;
  passportProof?:{challengeId:string;signature:string};
}
export interface Challenge {
  challengeId:string;nonce:string;subjectAgent:Identity;runtimeKeyId:string;
  requestId:string;requestHash:string;audience:string;operation:'mock-purchase';
  issuedAt:string;expiresAt:string;
}
export interface ModuleConfig {enabled:boolean;required:boolean;timeoutMs:number}
export interface Configuration {
  version:number;mode:'failFast'|'continueAll';modules:Record<ModuleId,ModuleConfig>;
}
export interface ModuleResult {
  moduleId:ModuleId;status:Status;reasonCodes:string[];humanReadableReason:string;
  evidence:JsonObject;observedAt:string;expiresAt:string|null;durationMs:number;
  inputHash:string;outputHash:string;
}
export interface AuthenticationResult {
  traceId:string;verdict:Verdict;assuranceProfile:Profile;policyProfile:Profile;
  development:boolean;enabledModules:ModuleId[];skippedModules:ModuleId[];
  evidenceBundleHash:string;reasonCodes:string[];modules:ModuleResult[];
  ticket?:string;ticketExpiresAt?:string;
}
export interface RegistrySnapshot {
  identity:Identity;owner:string;agentWallet:string;agentURI:string;
  runtimeBindingHash:string;blockNumber:string;blockHash:string;
  abiVersion:string;source:'anvil'|'sepolia'|'simulation';
}
export interface Registration {
  type:string;name:string;description:string;image:string;active:boolean;
  services:{name:string;endpoint:string;version?:string}[];
  registrations:{agentId:number;agentRegistry:string}[];
  x402Support:boolean;supportedTrust?:string[];
  agentproof:{runtimeBindingHash:string;runtimeEndpoint:string};
}
export interface IssuerTrust {publicKeyMultibase:string;statusOrigin:string;testIssuer:boolean}
export interface TrustStore {issuers:Record<string,IssuerTrust>;pretrustedAgents?:Record<string,{snapshot:RegistrySnapshot;registration:Registration}>}
export interface Transport {
  method:string;authority:string;path:string;rawBody:Buffer;
  headers:Record<string,string>;
}
export interface AuditEvent {
  eventId:string;traceId:string;parentEventId:string|null;eventType:string;
  moduleId:ModuleId|null;actor:string;timestamp:string;inputHash:string;
  outputHash:string;previousEventHash:string;reasonCodes:string[];
  evidenceReferences:string[];configurationSnapshot:Configuration|null;eventHash:string;
}
