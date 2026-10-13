/** Emit OpenAPI 3.1 as JSON-compatible YAML; runtime schemas are reused verbatim. */
import {mkdirSync,writeFileSync} from 'node:fs';
import * as schemas from '../packages/shared-schemas/index.ts';
const componentSchemas=Object.fromEntries(Object.entries(schemas).filter(([k])=>k.endsWith('Schema')));
const ref=(name:string)=>({'$ref':'#/components/schemas/'+name});
const empty={type:'object',properties:{},additionalProperties:false};
const paths:Record<string,any>={};
function endpoint(path:string,method:string,summary:string,server:'agent'|'verifier',body?:any,admin=false,signed=false){
 const op:any={summary,servers:[{url:server==='agent'?'http://127.0.0.1:3000':'http://127.0.0.1:3001'}],responses:{'200':{description:'Success or authentication verdict. A 200 authentication response can contain REJECT/PARTIAL; inspect verdict.'},'400':{description:'Invalid schema, signature, target, or configuration conflict'},'401':{description:'Administrator token missing or invalid'},'503':{description:'Source temporarily unavailable / server busy'}},security:admin?[{adminBearer:[]}]:[]};
 if(body)op.requestBody={required:true,content:{'application/json':{schema:body}}};
 op.parameters=[...path.matchAll(/\{(\w+)\}/g)].map(m=>({in:'path',name:m[1],required:true,schema:{type:'string'}}));
 if(signed)for(const name of ['Signature-Input','Signature','Content-Digest'])op.parameters.push({in:'header',name,required:true,schema:{type:'string'},description:'AgentProof strict RFC9421 Ed25519 profile. Use the provided crypto helpers; preserve the exact body bytes.'});
 if(path.includes('/protected/')){op.security=[{authenticationTicket:[]}];op.description='Single-use authentication ticket plus runtime-key HTTP proof, exact original purchase body. No actual purchase/payment or authorization policy is evaluated.';}
 paths[path]??={};paths[path][method]=op;
}
endpoint('/api/v1/challenges','post','Issue request-bound passport challenge','verifier',ref('challengeRequestSchema'));
endpoint('/api/v1/authenticate','post','Run the five sequential identity filters','verifier',ref('presentationSchema'),false,true);
endpoint('/api/v1/protected/mock-purchase','post','Redeem one-use proof-bound authentication ticket','verifier',ref('purchaseSchema'),false,true);
for(const [p,s]of [['/api/v1/traces','List recent authentication traces'],['/api/v1/traces/{traceId}','Read results and audit integrity'],['/api/v1/evidence/{hash}','Read independent evidence'],['/api/v1/modules','Read versioned module configuration'],['/api/v1/agents/{agentId}','Read simulated identity'],['/api/v1/security-events','Read non-VERIFIED request summaries']])endpoint(p,'get',s,'verifier',undefined,true);
endpoint('/api/v1/modules/{moduleId}','patch','Change administrator-only filter settings','verifier',ref('modulePatchSchema'),true);
endpoint('/api/v1/execution-mode','patch','Change failFast / continueAll','verifier',schemas.obj({expectedVersion:{type:'integer',minimum:1},mode:{enum:['failFast','continueAll']}}),true);
for(const p of ['/api/agents/prepare','/api/agents/register','/api/passports','/api/company-attestations','/api/tap/requests','/api/scenarios/{scenarioId}/run'])endpoint(p,'post','Local development Agent action: '+p,'agent',empty);
for(const p of ['/api/documents','/.well-known/agent-card.json','/.well-known/agent-registration.json'])endpoint(p,'get','Read public development Agent documents','agent');
endpoint('/api/presentations','post','Build, sign, submit and redeem a mock purchase','agent',schemas.obj({merchant:schemas.S,productId:schemas.S,amount:{type:'integer',minimum:0},purpose:{enum:['payment','browsing']},quantity:{type:'integer',minimum:1,maximum:100000},expirationSeconds:{type:'integer',minimum:10,maximum:300}}));
const doc={openapi:'3.1.0',info:{title:'AgentProof local authentication API',version:'0.1.0',description:'DEVELOPMENT SIMULATION ONLY. Primary Agent/verifier APIs. Runtime request schemas are reused; response schemas and auxiliary registry/issuer internal APIs are not fully described. Native JSON Schema validator, not Zod.'},paths,components:{schemas:componentSchemas,securitySchemes:{adminBearer:{type:'http',scheme:'bearer',description:'Verifier administrator secret; never send it to the Agent service.'},authenticationTicket:{type:'http',scheme:'bearer',description:'Short-lived ticket, insufficient without the request runtime-key signature.'}}}};
mkdirSync('docs/api',{recursive:true});writeFileSync('docs/api/openapi.yaml',JSON.stringify(doc,null,2)+'\n');
console.log('Generated docs/api/openapi.yaml (JSON is valid YAML).');
