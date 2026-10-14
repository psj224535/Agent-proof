import type {Schema} from './json.ts';
export {validate,ValidationError,parseJsonStrict} from './json.ts';
export * from './types.ts';
export const S:Schema={type:'string',minLength:1,maxLength:2048};
export const hashSchema:Schema={type:'string',pattern:'^[0-9a-f]{64}$'};
export const timeSchema:Schema={type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'};
export const signatureSchema:Schema={type:'string',pattern:'^[A-Za-z0-9_-]{86}$'};
export const arr=(items:Schema,minItems=0):Schema=>({type:'array',items,minItems,maxItems:128});
export const obj=(properties:Record<string,Schema>,optional:string[]=[]):Schema=>({type:'object',properties,required:Object.keys(properties).filter(k=>!optional.includes(k)),additionalProperties:false});
export const identitySchema=obj({chainId:{type:'integer',minimum:1},registry:S,agentId:{type:'string',pattern:'^(0|[1-9][0-9]{0,14})$'}});
export const bindingSchema=obj({subjectAgent:identitySchema,ownerWallet:S,runtimeKeyId:S,publicKeyMultibase:S,apsAgentId:S,endpoint:S,programVersion:S,issuedAt:timeSchema,expiresAt:timeSchema});
export const cardSchema=obj({
 name:S,description:S,version:S,provider:obj({organization:S,url:S}),
 supportedInterfaces:arr(obj({url:S,protocolBinding:{enum:['JSONRPC','HTTP+JSON','GRPC']},protocolVersion:{const:'1.0'}}),1),
 capabilities:obj({extensions:arr(obj({uri:S,required:{type:'boolean'},params:bindingSchema}),1),streaming:{type:'boolean'},pushNotifications:{type:'boolean'}},['streaming','pushNotifications']),
 defaultInputModes:arr(S,1),defaultOutputModes:arr(S,1),
 skills:arr(obj({id:S,name:S,description:S,tags:arr(S)}),1),
 securitySchemes:{type:'object',additionalProperties:obj({httpAuthSecurityScheme:obj({scheme:S,bearerFormat:S},['bearerFormat'])})},
 securityRequirements:arr(obj({schemes:{type:'object',additionalProperties:obj({list:arr(S)})}}),1),
 signatures:arr(obj({protected:S,signature:signatureSchema}),1)
},['signatures']);
export const passportSchema=obj({record_type:{const:'aps.agent-passport'},version:{const:'2.0'},passport_id:hashSchema,agent_id:S,verification_method:S,public_key_multibase:S,issued_at:timeSchema,expires_at:timeSchema,nonce:{type:'string',pattern:'^[0-9a-f]{32}$'},self_asserted:obj({display_name:S,capabilities:arr(S)},['display_name']),signature:signatureSchema});
export const companySchema=obj({attestationId:S,issuer:S,subjectAgent:identitySchema,operatorCompanyId:S,responsibleUserId:S,ownerWallet:S,runtimeKeyId:S,endpoint:S,programVersion:S,validFrom:timeSchema,expiresAt:timeSchema,status:{enum:['ACTIVE','SUSPENDED','REVOKED','EXPIRED']},statusUri:S,signature:signatureSchema});
export const purchaseSchema=obj({merchant:S,purpose:{enum:['payment','browsing']},productId:S,amount:{type:'integer',minimum:0},currency:{const:'KRW'},quantity:{type:'integer',minimum:1,maximum:100000},createdAt:timeSchema,expiresAt:timeSchema,nonce:{type:'string',pattern:'^[0-9a-f]{32}$'}});
export const presentationSchema=obj({presentationVersion:{const:'agentproof-presentation-v1'},requestId:{type:'string',pattern:'^[A-Za-z0-9_-]{8,100}$'},claimedIdentity:identitySchema,presentedAgentCard:cardSchema,presentedPassport:passportSchema,companyAttestation:companySchema,tapRequest:purchaseSchema,submittedAt:timeSchema,bundleHash:hashSchema,passportProof:obj({challengeId:S,signature:signatureSchema})},['presentedPassport','companyAttestation','passportProof']);
export const challengeRequestSchema=obj({subjectAgent:identitySchema,runtimeKeyId:S,requestId:S,requestHash:hashSchema});
export const modulePatchSchema=obj({expectedVersion:{type:'integer',minimum:1},enabled:{type:'boolean'},required:{type:'boolean'},timeoutMs:{type:'integer',minimum:100,maximum:10000}},['enabled','required','timeoutMs']);
export const registrationSchema=obj({type:{const:'https://eips.ethereum.org/EIPS/eip-8004#registration-v1'},name:S,description:S,image:S,active:{type:'boolean'},services:arr(obj({name:S,endpoint:S,version:S},['version']),1),x402Support:{type:'boolean'},registrations:arr(obj({agentId:{type:'integer',minimum:0},agentRegistry:S}),1),supportedTrust:arr(S),agentproof:obj({runtimeBindingHash:hashSchema,runtimeEndpoint:S})},['supportedTrust']);
export const EXTENSION_URI='https://agentproof.example/extensions/runtime-identity/v1';
export const MOCK_PATH='/api/v1/protected/mock-purchase';
export const AUTH_PATH='/api/v1/authenticate';
