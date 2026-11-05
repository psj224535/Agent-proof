import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {fixture} from './helpers.ts';
import {canonical,hash,signBytes,iso,randomHex} from '../packages/crypto/index.ts';
import {protectedTransport} from '../packages/agent-kit/index.ts';
import {SafeFetcher} from '../packages/network/safe-fetch.ts';
import {EXECUTION_WALLET_EXTENSION_URI} from '../packages/trading/eip712.ts';
import type {OnchainTradeIntent} from '../packages/trading/types.ts';
import type {Presentation} from '../packages/shared-schemas/types.ts';

type Fixture=Awaited<ReturnType<typeof fixture>>;
const executor='0x1234567890123456789012345678901234567890';
async function usingFixture(fn:(f:Fixture)=>Promise<void>){const f=await fixture();try{await fn(f);}finally{await f.close();}}
function addExecutor(f:Fixture){
 const params={...f.d.binding,chainId:f.d.identity.chainId,registry:f.d.identity.registry,agentId:f.d.identity.agentId,executionWallet:executor,metadataKey:'agentproof.executionWallet.v1' as const,encoding:'abi.encode(address)' as const};
 f.d.card.capabilities.extensions.push({uri:EXECUTION_WALLET_EXTENSION_URI,required:false,params});
 const {signatures,...unsigned}=f.d.card;const header=Buffer.from(canonical({alg:'EdDSA',kid:f.d.key.keyId,typ:'JOSE'})).toString('base64url');
 f.d.card.signatures=[{protected:header,signature:signBytes(f.d.key,Buffer.from(header+'.'+Buffer.from(canonical(unsigned)).toString('base64url')))}];
}
function intent(f:Fixture):OnchainTradeIntent{return {version:'agentproof-trade-v1',chainId:31337,exchangeContract:'0x'+'11'.repeat(20),buyerWallet:'0x'+'22'.repeat(20),agentIdentity:{...f.d.identity},executionWallet:executor,action:'BUY',token:'0x'+'33'.repeat(20),quantity:'2000000000000000000',maxTotalCostWei:'200000000000000',merchant:'merchant.test',purpose:'payment',createdAt:iso(f.clock.now),expiresAt:iso(f.clock.now+120000),nonce:randomHex(16)};}
async function authenticateTrade(f:Fixture,edit?:(i:OnchainTradeIntent)=>void){const i=intent(f);edit?.(i);return f.run(p=>{(p as Presentation<any>).tapRequest=i;});}

test('trade authentication reuses all five filters and issues an action-bound trading-only ticket',()=>usingFixture(async f=>{
 addExecutor(f);const {result,p}=await authenticateTrade(f);assert.equal(result.verdict,'VERIFIED');assert.ok(result.modules.every(m=>m.status==='PASS'));
 const claims=f.verifier.decodeTicket(result.ticket!);assert.equal(claims.allowedOperation,'onchain-trade');assert.equal(claims.requestHash,hash(p.tapRequest));assert.equal(claims.agentCardHash,hash(f.d.card));
 await assert.rejects(()=>f.verifier.protectedPurchase(protectedTransport(p,result.ticket!,f.d.key,'merchant.test',f.clock.now)),/TICKET_AUDIENCE_OR_OPERATION/);
}));
test('a signed trade cannot substitute a different registered Agent identity',()=>usingFixture(async f=>{
 addExecutor(f);const {result}=await authenticateTrade(f,i=>{i.agentIdentity.agentId='2';});assert.equal(result.verdict,'REJECT');assert.equal(result.ticket,undefined);assert.ok(result.modules.find(m=>m.moduleId==='visa-tap')!.reasonCodes.includes('TRADE_AGENT_IDENTITY_MISMATCH'));
}));
test('a signed trade cannot substitute a different execution wallet',()=>usingFixture(async f=>{
 addExecutor(f);const {result}=await authenticateTrade(f,i=>{i.executionWallet='0x'+'44'.repeat(20);});assert.equal(result.verdict,'REJECT');assert.equal(result.ticket,undefined);assert.ok(result.modules.find(m=>m.moduleId==='visa-tap')!.reasonCodes.includes('TRADE_EXECUTION_EXTENSION_MISMATCH'));
}));
test('trade authentication refuses an absent execution extension',()=>usingFixture(async f=>{
 const {result}=await authenticateTrade(f);assert.equal(result.verdict,'REJECT');assert.equal(result.ticket,undefined);assert.ok(result.modules.find(m=>m.moduleId==='visa-tap')!.reasonCodes.includes('TRADE_EXECUTION_EXTENSION_MISMATCH'));
}));
test('trading schema rejects numeric wei, arbitrary calldata, and mainnet before authentication',()=>usingFixture(async f=>{
 addExecutor(f);
 for(const edit of [(i:any)=>{i.maxTotalCostWei=200000;},(i:any)=>{i.calldata='0xdead';},(i:any)=>{i.chainId=1;i.agentIdentity.chainId=1;}])await assert.rejects(()=>authenticateTrade(f,edit));
}));
test('local company opt-in cannot let simulation claim a production identity',()=>usingFixture(async f=>{
 f.verifier.options.development=false;f.verifier.options.allowLocalDemoAttestation=true;f.verifier.options.assuranceProfile='SEPOLIA_TESTNET';
 const {result}=await f.run();assert.equal(result.verdict,'REJECT');assert.ok(result.reasonCodes.includes('SIMULATION_CANNOT_PROVE_PRODUCTION_IDENTITY'));assert.equal(result.ticket,undefined);
}));
test('local company opt-in remains rejected outside explicit SEPOLIA_TESTNET assurance',()=>usingFixture(async f=>{
 f.verifier.options.development=false;f.verifier.options.allowLocalDemoAttestation=true;f.d.snapshot.source='sepolia';
 const {result}=await f.run();assert.equal(result.verdict,'REJECT');assert.ok(result.reasonCodes.includes('TEST_ISSUER_CANNOT_PROVE_PRODUCTION_COMPANY'));assert.equal(result.ticket,undefined);
}));
test('SEPOLIA_TESTNET label alone does not allow a local company issuer',()=>usingFixture(async f=>{
 f.verifier.options.development=false;f.verifier.options.assuranceProfile='SEPOLIA_TESTNET';f.d.snapshot.source='sepolia';
 const {result}=await f.run();assert.equal(result.verdict,'REJECT');assert.ok(result.reasonCodes.includes('TEST_ISSUER_CANNOT_PROVE_PRODUCTION_COMPANY'));assert.equal(result.ticket,undefined);
}));
test('explicit testnet-only local company opt-in permits valid signed evidence and still rejects revoked evidence',()=>usingFixture(async f=>{
 // This is a verifier unit fixture: source labels are injected, not evidence of a live Sepolia read.
 f.verifier.options.development=false;f.verifier.options.assuranceProfile='SEPOLIA_TESTNET';f.verifier.options.allowLocalDemoAttestation=true;f.d.snapshot.source='sepolia';
 const accepted=(await f.run()).result;assert.equal(accepted.verdict,'VERIFIED');assert.equal(accepted.assuranceProfile,'SEPOLIA_TESTNET');assert.equal(accepted.modules.find(m=>m.moduleId==='company-attestation')!.status,'PASS');
 f.flags.status='REVOKED';const rejected=(await f.run()).result;assert.equal(rejected.verdict,'REJECT');assert.equal(rejected.ticket,undefined);
}));
test('local company fetch allowlist does not weaken default SSRF protection or follow redirects',async()=>{
 let requests=0;const server=createServer((req,res)=>{requests++;if(req.url==='/redirect'){res.writeHead(302,{location:'http://169.254.169.254/latest/meta-data/'});res.end();return;}res.writeHead(200,{'content-type':'application/json'});res.end('{"testIssuer":true}');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const origin='http://127.0.0.1:'+address.port;
 try{
  const production=new SafeFetcher({development:false});const localIssuer=new SafeFetcher({development:true,allowedDevelopmentOrigins:[origin]});
  assert.equal(((await localIssuer.json(origin+'/status')).value as any).testIssuer,true);assert.equal(requests,1);
  await assert.rejects(()=>production.json(origin+'/status'),/SSRF_SCHEME_OR_PORT/);
  await assert.rejects(()=>localIssuer.json(origin+'/redirect'),/SSRF_REDIRECT_BLOCKED/);
  await assert.rejects(()=>localIssuer.json('http://169.254.169.254/latest/meta-data/'),/SSRF_SCHEME_OR_PORT/);
  await assert.rejects(()=>localIssuer.json(origin.replace('127.0.0.1','localhost')+'/status'),/SSRF_SCHEME_OR_PORT/);
  await assert.rejects(()=>localIssuer.json(origin+'/status#fragment'),/SSRF_URI_CREDENTIALS_OR_FRAGMENT/);
  await assert.rejects(()=>localIssuer.json(origin.replace('http://','http://user:secret@')+'/status'),/SSRF_URI_CREDENTIALS_OR_FRAGMENT/);
  assert.equal(requests,2,'Only allowlisted request and rejected redirect reach the HTTP server');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
