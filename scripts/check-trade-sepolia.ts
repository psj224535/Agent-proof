import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {TradingChain,artifact,jsonSafe} from '../services/common/trading-chain.ts';
if(existsSync('.env.sepolia'))process.loadEnvFile('.env.sepolia');
const chain=new TradingChain({rpcUrl:process.env.SEPOLIA_RPC_URL||'https://ethereum-sepolia-rpc.publicnode.com'});
let failed=false;const checks:any[]=[];
async function check(name:string,f:()=>Promise<any>){try{checks.push({name,status:'PASS',value:await f()});}catch(e){failed=true;checks.push({name,status:'NOT_READY',reason:(e as any).code??(e as Error).message});}}
await check('Compiled contracts',async()=>({exchangeBytes:(artifact('AgentProofDemoExchange').bytecode.object.length-2)/2,tokenBytes:(artifact('DemoToken').bytecode.object.length-2)/2}));
await check('Sepolia chain and pinned ERC-8004',async()=>{await chain.assertChain();return {chainId:chain.chainId,registry:chain.registry};});
await check('Existing registered Agent local runtime state',async()=>{const path=join(chain.root,'agent','sepolia-agent.json');if(!existsSync(path))throw new Error('Restore the original .state-sepolia/agent state. Never register a replacement agent ID.');const state=JSON.parse(readFileSync(path,'utf8'));return {agentId:state.documents.identity.agentId,agentURI:state.documents.snapshot.agentURI};});
await check('Exchange public state',async()=>{await chain.verifyExchange();return {address:chain.exchange(),owner:await chain.read('owner'),verifier:await chain.read('trustedVerifier'),listings:await chain.listings()};});
console.log(JSON.stringify(jsonSafe({mode:'READ_ONLY; no deployment or signature',status:failed?'USER_SETUP_REQUIRED':'PUBLIC_CHAIN_CHECKS_PASS',checks,manual:'MetaMask deployment, metadata binding, deposit, policy and executor gas remain user actions. Readiness does not imply a completed trade.'}),null,2));if(failed)process.exitCode=1;
