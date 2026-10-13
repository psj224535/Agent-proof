import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import {resolve,join} from 'node:path';
import {loadKey,secret} from '../services/common/http.ts';import {TEST_ISSUER} from '../packages/agent-kit/index.ts';
if(process.env.NODE_ENV==='production')throw new Error('Development simulator must not run in production.');
if(existsSync('.env'))process.loadEnvFile('.env');
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
const state=resolve(process.env.STATE_DIR??'.state');mkdirSync(state,{recursive:true,mode:0o700});
const ports={AGENT_PORT:process.env.AGENT_PORT??'3000',VERIFIER_PORT:process.env.VERIFIER_PORT??'3001',REGISTRY_PORT:process.env.REGISTRY_PORT??'3002',ISSUER_PORT:process.env.ISSUER_PORT??'3003'};
const origins={AGENT_ORIGIN:'http://127.0.0.1:'+ports.AGENT_PORT,VERIFIER_ORIGIN:'http://127.0.0.1:'+ports.VERIFIER_PORT,REGISTRY_ORIGIN:'http://127.0.0.1:'+ports.REGISTRY_PORT,ISSUER_ORIGIN:'http://127.0.0.1:'+ports.ISSUER_PORT};
const issuerKey=loadKey(join(state,'issuer','key.json'));mkdirSync(join(state,'verifier'),{recursive:true,mode:0o700});
const trustPath=join(state,'verifier','trust.json');const expected={issuers:{[TEST_ISSUER]:{publicKeyMultibase:issuerKey.publicKeyMultibase,statusOrigin:origins.ISSUER_ORIGIN,testIssuer:true}}};
// Launcher is an explicit local administrator, not an Agent-side trust enrollment endpoint.
if(existsSync(trustPath)){const previous=JSON.parse(readFileSync(trustPath,'utf8'));if(JSON.stringify(previous)!==JSON.stringify(expected))throw new Error('TRUST_STORE_CHANGED: review the public issuer key/origin before replacing verifier/trust.json.');}else writeFileSync(trustPath,JSON.stringify(expected,null,2),{mode:0o600});
secret(join(state,'verifier','admin-token'));
const children:ReturnType<typeof spawn>[]=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');setTimeout(()=>process.exit(code),250).unref();}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
for(const [name,path] of [['registry','services/registry-simulator/server.ts'],['issuer','services/test-issuer/server.ts'],['verifier','services/verifier-service/server.ts'],['agent','services/agent-service/server.ts']]){
 const env:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:process.env.HOME,LANG:process.env.LANG,...ports,...origins,ROLE_STATE_DIR:join(state,name),HOST:'127.0.0.1',AGENTPROOF_DEVELOPMENT:'true',NODE_ENV:'development'};
 if(name==='verifier')for(const key of ['DATABASE_URL','ERC8004_FILTER_ENABLED','A2A_FILTER_ENABLED','APS_FILTER_ENABLED','COMPANY_FILTER_ENABLED','TAP_FILTER_ENABLED'])if(process.env[key])env[key]=process.env[key];
 // No verifier secrets are passed in Agent environment. Separate OS users/containers are needed for a hard filesystem boundary.
 const c=spawn(process.execPath,['--experimental-strip-types',path],{cwd:root,env,stdio:'inherit'});children.push(c);c.on('exit',code=>{if(!stopping){console.error(name+' stopped: '+code);stop(1);}});
}
async function ready(origin:string){for(let i=0;i<100;i++){try{const r=await fetch(origin+'/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Service startup failed: '+origin);}
try{await Promise.all(Object.values(origins).map(ready));console.log('\nAgentProof DEVELOPMENT SIMULATION\nAgent portal: '+origins.AGENT_ORIGIN+'\nVerifier dashboard: '+origins.VERIFIER_ORIGIN+'\nRead admin token: npm run admin-token\nNo blockchain transaction, real KYC, Visa certification, or payment is simulated as a real fact.\n');}catch(e){console.error(String(e));stop(1);}
