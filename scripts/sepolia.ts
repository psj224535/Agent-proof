import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {secret} from '../services/common/http.ts';

const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
if(existsSync('.env.sepolia'))process.loadEnvFile('.env.sepolia');
const state=resolve(process.env.SEPOLIA_STATE_DIR??'.state-sepolia');mkdirSync(state,{recursive:true,mode:0o700});
const ports={SEPOLIA_AGENT_PORT:process.env.SEPOLIA_AGENT_PORT??'3100',VERIFIER_PORT:process.env.SEPOLIA_VERIFIER_PORT??'3101'};
const origins={AGENT_ORIGIN:'http://127.0.0.1:'+ports.SEPOLIA_AGENT_PORT,VERIFIER_ORIGIN:'http://127.0.0.1:'+ports.VERIFIER_PORT};
const verifierDir=join(state,'verifier');mkdirSync(verifierDir,{recursive:true,mode:0o700});const trustPath=join(verifierDir,'trust.json'),emptyTrust={issuers:{}};
if(existsSync(trustPath)){const previous=JSON.parse(readFileSync(trustPath,'utf8'));if(JSON.stringify(previous)!==JSON.stringify(emptyTrust))throw new Error('SEPOLIA_TRUST_STORE_CHANGED: review .state-sepolia/verifier/trust.json.');}else writeFileSync(trustPath,JSON.stringify(emptyTrust,null,2),{mode:0o600});
secret(join(verifierDir,'admin-token'));
const common:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:process.env.HOME,LANG:process.env.LANG,...ports,...origins,HOST:'127.0.0.1',AGENTPROOF_NETWORK:'sepolia',AGENTPROOF_DEVELOPMENT:'false',NODE_ENV:'development',SEPOLIA_RPC_URL:process.env.SEPOLIA_RPC_URL??'https://ethereum-sepolia-rpc.publicnode.com',AGENT_OWNER_ADDRESS:process.env.AGENT_OWNER_ADDRESS??'0x422A6dDB79F4a13B58f7aAedD92f464c3e1e70A9',AGENT_PUBLIC_ORIGIN:process.env.AGENT_PUBLIC_ORIGIN??'https://psj224535.github.io/Agent-proof',PUBLIC_SITE_DIR:resolve('site')};
const children:ReturnType<typeof spawn>[]=[],roles=[['verifier','services/verifier-service/server.ts'],['agent','services/sepolia-service/server.ts']] as const;let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),250).unref();}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
for(const [role,path] of roles){const env:NodeJS.ProcessEnv={...common,ROLE_STATE_DIR:join(state,role)};if(role==='verifier')for(const key of ['DATABASE_URL','SEPOLIA_CONFIRMATIONS','ERC8004_FILTER_ENABLED','A2A_FILTER_ENABLED','APS_FILTER_ENABLED','COMPANY_FILTER_ENABLED','TAP_FILTER_ENABLED'])if(process.env[key])env[key]=process.env[key];const child=spawn(process.execPath,['--experimental-strip-types',path],{cwd:root,env,stdio:'inherit'});children.push(child);child.on('exit',code=>{if(!stopping){console.error(role+' stopped: '+code);stop(1);}});}
async function ready(origin:string){for(let i=0;i<150;i++){try{const response=await fetch(origin+'/health');if(response.ok)return;}catch{}await new Promise(done=>setTimeout(done,200));}throw new Error('Service startup failed: '+origin);}
try{await Promise.all(Object.values(origins).map(ready));console.log('\nAgentProof ETHEREUM SEPOLIA MODE\nRegistration console: '+origins.AGENT_ORIGIN+'\nVerifier dashboard: '+origins.VERIFIER_ORIGIN+'\nPublic agent URI: '+common.AGENT_PUBLIC_ORIGIN+'/.well-known/agent-registration.json\nRead admin token: npm run admin-token:sepolia\n\nMetaMask signs every write. No private key or seed phrase is read by this project. Sepolia ETH has no mainnet value.\n');}catch(error){console.error(String(error));stop(1);}
