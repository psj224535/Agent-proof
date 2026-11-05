import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {loadViem} from '../packages/erc8004-filter/viem-reader.ts';
import {TradingChain,savePrivate} from '../services/common/trading-chain.ts';
import {ensure} from '../packages/verification-core/errors.ts';
if(existsSync('.env.sepolia'))process.loadEnvFile('.env.sepolia');
const chain=new TradingChain({rpcUrl:process.env.SEPOLIA_RPC_URL||'https://ethereum-sepolia-rpc.publicnode.com'}),c=chain.config(),v=loadViem();
ensure(c.exchangeContract&&c.constructorArguments,'CONFIRMED_EXCHANGE_DEPLOYMENT_REQUIRED');
const targets=[{address:c.exchangeContract,contract:'src/AgentProofDemoExchange.sol:AgentProofDemoExchange',args:v.encodeAbiParameters([{type:'address'},{type:'address'},{type:'address'}],c.constructorArguments)},...Object.entries(c.tokenDeployments??{}).map(([i,d]:[string,any])=>({address:c.tokens[Number(i)],contract:'src/DemoToken.sol:DemoToken',args:v.encodeAbiParameters([{type:'string'},{type:'string'},{type:'address'}],d.args)}))];
const apiKey=process.env.ETHERSCAN_API_KEY;let allVerified=true;
for(const target of targets){const args=['verify-contract','--root','contracts','--chain','sepolia','--watch','--constructor-args',target.args,target.address,target.contract];console.log('Public verification command: forge '+args.join(' '));if(!apiKey){allVerified=false;continue;}const result=spawnSync('forge',args,{env:{...process.env,ETHERSCAN_API_KEY:apiKey},encoding:'utf8',maxBuffer:8_000_000});const output=(result.stdout??'')+(result.stderr??''); // Keys are passed only via environment, redact before any output.
console.log(output.split(apiKey).join('[REDACTED]'));const success=result.status===0&&/successfully verified|already verified|contract successfully verified/i.test(output);if(!success)allVerified=false;}
if(apiKey){c.sourceVerification=allVerified?(targets.length===4?'VERIFIED':'PARTIAL'):'VERIFICATION_INCOMPLETE';savePrivate(chain.configPath,c);if(!allVerified)process.exitCode=1;}else console.log('NOT_VERIFIED: Set ETHERSCAN_API_KEY locally, then rerun. No source verification has been claimed.');
