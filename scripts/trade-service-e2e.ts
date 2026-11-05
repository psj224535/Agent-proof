/** Exercises the real Agent trading backend and verifier over HTTP against disposable Anvil. */
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {runAnvilE2E} from './trade-anvil-e2e.ts';
import {createTradingBackend} from '../packages/trading/backend.ts';
import {createTradingVerifier} from '../services/verifier-service/trading.ts';
import {Verifier} from '../packages/verification-core/engine.ts';
import {serve,reply} from '../services/common/http.ts';
import {hash,randomHex} from '../packages/crypto/index.ts';
import {presentation,addProof,authenticateTransport} from '../packages/agent-kit/index.ts';
import {bundleHash} from '../packages/aps-passport-filter/passport.ts';
import {loadViem} from '../packages/erc8004-filter/viem-reader.ts';

async function freePort(){return new Promise<number>((resolve,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();if(!a||typeof a==='string')throw new Error('PORT');s.close(()=>resolve(a.port));});});}
await runAnvilE2E(async context=>{
 const {state,client,keys,wallets,registry,exchange,documents,verifier,tradingChain,artifact,write}=context,v=loadViem();
 const verifierPort=await freePort(),agentPort=await freePort();
 const verifierOrigin=`http://127.0.0.1:${verifierPort}`,agentOrigin=`http://127.0.0.1:${agentPort}`;
 const serviceVerifier=new Verifier({...verifier.options,audience:new URL(verifierOrigin).host,now:Date.now});
 const tradingVerifier=createTradingVerifier(serviceVerifier,tradingChain,join(state,'verifier-service'));
 const backend=createTradingBackend({chain:tradingChain,dir:join(state,'agent-service'),verifierOrigin,getDocuments:()=>documents,publish:()=>{},save:()=>{}});
 const oldAgentPort=process.env.SEPOLIA_AGENT_PORT;process.env.SEPOLIA_AGENT_PORT=String(agentPort);
 const verifierServer=await serve(verifierPort,async r=>{
  if(r.path==='/api/v1/challenges')reply(r.res,200,await serviceVerifier.challenge(r.json));
  else if(r.path==='/api/v1/authenticate')reply(r.res,200,await serviceVerifier.authenticate(r.json as any,r.transport));
  else if(r.path==='/api/trading/execution-result')reply(r.res,200,await tradingVerifier.recordResult(r.transport,r.json));
  else if(r.path==='/api/trading/verifier')reply(r.res,200,{verifierAddress:tradingVerifier.address});
  else if(r.path==='/api/trading/authorize'||r.path==='/api/trading/execution-authorization'||r.path==='/api/trading/preflight')reply(r.res,200,await tradingVerifier.evaluate(r.transport,r.json,r.path.endsWith('execution-authorization'),r.path.endsWith('preflight')));
 });
 const agentServer=await serve(agentPort,async r=>{if(r.path==='/api/sepolia/publication')reply(r.res,200,{published:true});else await backend.handle(r);});
 try {
  async function api(path:string,body?:any,ok=true){const response=await fetch(agentOrigin+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data:any=await response.json();if(ok)assert.equal(response.status,200,`${path}: ${JSON.stringify(data)}`);else assert.ok(response.status>=400,`${path} unexpectedly succeeded`);return data;}
  async function sendPrepared(prepared:any,role='buyer') {const t=prepared.transaction;const hash=await wallets[role].sendTransaction({to:t.to,data:t.data,value:BigInt(t.value??0)});return api('/api/trading/policy/confirm',{preparationId:prepared.preparationId,transactionHash:hash});}
  await write('merchant',exchange,artifact('AgentProofDemoExchange').abi,'setTrustedVerifier',[tradingVerifier.address]);
  await client.request({method:'anvil_setBalance',params:[keys.agentOwner.address,v.toHex(10n**18n)]});
  await client.request({method:'anvil_setBalance',params:[backend.executorAddress,v.toHex(10n**18n)]});
  const binding=await api('/api/trading/binding/prepare',{wallet:keys.agentOwner.address});await sendPrepared(binding,'agentOwner');
  const configure=await api('/api/trading/policy/prepare',{wallet:keys.buyer.address,action:'configure',buyEnabled:true,maxPerTradeWei:'200000000000000',autoApproveLimitWei:'200000000000000',totalBudgetLimitWei:'2000000000000000',validUntil:String(Math.floor(Date.now()/1000)+3600)});await sendPrepared(configure);
  const deposit=await api('/api/trading/policy/prepare',{wallet:keys.buyer.address,action:'deposit',amountWei:'1000000000000000'});const depositReceipt=await sendPrepared(deposit);
  const mismatchedPreparation=await api('/api/trading/policy/prepare',{wallet:keys.buyer.address,action:'deposit',amountWei:'1'});const mismatchedConfirmation=await api('/api/trading/policy/confirm',{preparationId:mismatchedPreparation.preparationId,transactionHash:depositReceipt.transactionHash},false);assert.equal(mismatchedConfirmation.error,'TRANSACTION_CALLDATA_MISMATCH');
  const invalidSchema=await api('/api/trading/intent',{goal:'BUY_HIGHEST_DEMO_SCORE_TOKEN',buyerWallet:keys.buyer.address,spendWei:200000},false);assert.equal(invalidSchema.error,'SCHEMA_INVALID');
  const arbitraryCall=await api('/api/trading/policy/prepare',{wallet:keys.buyer.address,action:'deposit',amountWei:'1',calldata:'0xdead'},false);assert.equal(arbitraryCall.error,'SCHEMA_INVALID');
  const crossOrigin=await fetch(agentOrigin+'/api/trading/policy/prepare',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.invalid'},body:JSON.stringify({wallet:keys.buyer.address,action:'deposit',amountWei:'1'})});assert.equal((await crossOrigin.json() as any).error,'CROSS_ORIGIN_REQUEST_BLOCKED');
  const readiness=await api('/api/trading/readiness?wallet='+keys.buyer.address);assert.equal(readiness.ready,true,JSON.stringify(readiness.checks));
  // The latest mined block can lag wall time: fresh authorizations must still simulate safely.
  await new Promise(resolve=>setTimeout(resolve,2100));
  const created=await api('/api/trading/intent',{goal:'내 예산 안에서 가장 오를 가능성이 높은 테스트 코인을 사줘.',buyerWallet:keys.buyer.address,spendWei:'200000000000000'});
  assert.equal(created.selection.symbol,'dNOVA');
  const traceId=created.traceId;
  const authenticated=await api('/api/trading/authenticate',{traceId});assert.equal(authenticated.authentication.verdict,'VERIFIED');
  const authorized=await api('/api/trading/authorize',{traceId});assert.equal(authorized.authorization.verdict,'ALLOW');
  const signed=await api('/api/trading/execution-authorization',{traceId});assert.equal(signed.authorization.verdict,'ALLOW');
  const before=await tradingChain.snapshot(keys.buyer.address,created.intent.token);
  const executed=await api('/api/trading/execute',{traceId});assert.equal(executed.status,'CONFIRMED',JSON.stringify(executed));
  assert.equal(executed.execution.authenticationAuditIntegrity,true);const originalTrace=await context.store.trace(executed.execution.authenticationTraceId);assert.equal(originalTrace.integrity,true);assert.ok(originalTrace.events.some((e:any)=>e.eventType==='TRANSACTION_CONFIRMED'));
  assert.equal(BigInt(executed.execution.after.tokenBalance)-BigInt(before.tokenBalance),2n*10n**18n);
  assert.equal(BigInt(before.budgetWei)-BigInt(executed.execution.after.budgetWei),200_000_000_000_000n);
  const serial=JSON.stringify(executed);assert.ok(!serial.includes('privateKey'));assert.ok(!serial.includes('authenticationTicket'));assert.ok(!serial.includes('expectedTransaction'));assert.ok(!serial.includes('executionAuthorization'));
  const stored=await api('/api/trading/executions/'+traceId);assert.equal(stored.status,'CONFIRMED');assert.equal(stored.execution.transactionHash,executed.execution.transactionHash);
  const audit=await api('/api/trading/audit/'+traceId);assert.equal(audit.integrity,true);assert.ok(audit.events.some((e:any)=>e.type==='TRANSACTION_CONFIRMED'));
  const count=await client.getTransactionCount({address:backend.executorAddress});await api('/api/trading/execute',{traceId},false);assert.equal(await client.getTransactionCount({address:backend.executorAddress}),count);
  // Reissue a fresh authorization, then mutate runtime binding before execute: no broadcast is permitted.
  const changed=await api('/api/trading/intent',{goal:'BUY_HIGHEST_DEMO_SCORE_TOKEN',buyerWallet:keys.buyer.address,spendWei:'200000000000000'});
  await api('/api/trading/authenticate',{traceId:changed.traceId});await api('/api/trading/authorize',{traceId:changed.traceId});await api('/api/trading/execution-authorization',{traceId:changed.traceId});
  await write('merchant',registry,artifact('MockIdentityRegistry').abi,'setMetadata',[7n,'agentproof.runtimeBinding.v1','0x'+'ff'.repeat(32)]);
  const runtimeChanged=await api('/api/trading/execute',{traceId:changed.traceId},false);assert.equal(await client.getTransactionCount({address:backend.executorAddress}),count,'Runtime-changed identity must submit no transaction');
  await write('merchant',registry,artifact('MockIdentityRegistry').abi,'setMetadata',[7n,'agentproof.runtimeBinding.v1','0x'+hash(documents.binding)]);
  async function prepareAuthorized(){const r=await api('/api/trading/intent',{goal:'BUY_HIGHEST_DEMO_SCORE_TOKEN',buyerWallet:keys.buyer.address,spendWei:'200000000000000'});await api('/api/trading/authenticate',{traceId:r.traceId});await api('/api/trading/authorize',{traceId:r.traceId});await api('/api/trading/execution-authorization',{traceId:r.traceId});return r;}
  const gasTrade=await prepareAuthorized();await client.request({method:'anvil_setBalance',params:[backend.executorAddress,'0x0']});
  const gasFailure=await api('/api/trading/execute',{traceId:gasTrade.traceId},false);assert.equal(gasFailure.error,'AGENT_EXECUTOR_GAS_INSUFFICIENT');assert.equal(await client.getTransactionCount({address:backend.executorAddress}),count);
  await client.request({method:'anvil_setBalance',params:[backend.executorAddress,'0x1']});const positiveGasFailure=await api('/api/trading/execute',{traceId:gasTrade.traceId},false);assert.equal(positiveGasFailure.error,'AGENT_EXECUTOR_GAS_INSUFFICIENT');assert.equal(await client.getTransactionCount({address:backend.executorAddress}),count);
  await client.request({method:'anvil_setBalance',params:[backend.executorAddress,v.toHex(10n**18n)]});
  const staleTrade=await prepareAuthorized();documents.card.description+=' changed after issuance';
  const staleCard=await api('/api/trading/execute',{traceId:staleTrade.traceId},false);assert.equal(staleCard.error,'STALE_AGENT_CARD_REAUTHENTICATE');assert.equal(await client.getTransactionCount({address:backend.executorAddress}),count);documents.card.description=documents.card.description.replace(' changed after issuance','');
  const inactiveTrade=await prepareAuthorized();documents.registration.active=false;
  const inactive=await api('/api/trading/execute',{traceId:inactiveTrade.traceId},false);assert.equal(inactive.error,'AGENT_INACTIVE');assert.equal(await client.getTransactionCount({address:backend.executorAddress}),count);documents.registration.active=true;
  const asking=await api('/api/trading/policy/prepare',{wallet:keys.buyer.address,action:'configure',buyEnabled:true,maxPerTradeWei:'200000000000000',autoApproveLimitWei:'1',totalBudgetLimitWei:'2000000000000000',validUntil:String(Math.floor(Date.now()/1000)+3600)});await sendPrepared(asking);
  const ask=await api('/api/trading/intent',{goal:'BUY_HIGHEST_DEMO_SCORE_TOKEN',buyerWallet:keys.buyer.address,spendWei:'200000000000000'});await api('/api/trading/authenticate',{traceId:ask.traceId});const askDecision=await api('/api/trading/authorize',{traceId:ask.traceId});assert.equal(askDecision.authorization.verdict,'ASK');
  const challenge=await api('/api/trading/human-approval/challenge',{traceId:ask.traceId});const humanSignature=await keys.buyer.signTypedData(challenge.typedData);
  const human=await api('/api/trading/human-approval/confirm',{traceId:ask.traceId,signature:humanSignature});assert.equal(human.authorization.verdict,'ALLOW');
  await api('/api/trading/execution-authorization',{traceId:ask.traceId});const humanExecution=await api('/api/trading/execute',{traceId:ask.traceId});assert.equal(humanExecution.status,'CONFIRMED');
  const wrong=presentation(documents,new URL(verifierOrigin).host) as any;wrong.tapRequest={...created.intent,nonce:randomHex(16),agentIdentity:{...created.intent.agentIdentity,agentId:'8'}};wrong.bundleHash=bundleHash(wrong);
  const challengeResponse=await fetch(verifierOrigin+'/api/v1/challenges',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subjectAgent:wrong.claimedIdentity,runtimeKeyId:documents.key.keyId,requestId:wrong.requestId,requestHash:wrong.bundleHash})});assert.equal(challengeResponse.status,200);addProof(wrong,await challengeResponse.json() as any,documents.key);
  const wrongTransport=authenticateTransport(wrong,documents.key,new URL(verifierOrigin).host);const wrongResponse=await fetch(verifierOrigin+wrongTransport.path,{method:wrongTransport.method,headers:wrongTransport.headers,body:wrongTransport.rawBody});const wrongResult:any=await wrongResponse.json();assert.equal(wrongResult.verdict,'REJECT');assert.ok(wrongResult.modules.some((m:any)=>m.reasonCodes.includes('TAP_TRADE_IDENTITY_MISMATCH')||m.reasonCodes.some((r:string)=>r.includes('IDENTITY_MISMATCH'))));assert.equal(wrongResult.ticket,undefined);
  const exchangeCode=await client.getCode({address:exchange});await client.request({method:'anvil_setCode',params:[exchange,'0x60006000fd']});await assert.rejects(()=>tradingChain.verifyExchange(),/EXCHANGE_CODE_MISMATCH/);await client.request({method:'anvil_setCode',params:[exchange,exchangeCode]});await tradingChain.verifyExchange();
  return {rpcTimestampDriftHandled:true,preparationMismatchBlocked:true,apiSchemaAndCrossOriginBlocked:true,tamperedExchangeCodeBlocked:true,nonzeroInsufficientGasBlocked:positiveGasFailure.error,originalAuthenticationAuditLinked:true,wrongAgentIdentityBlocked:true,gasInsufficientBlocked:gasFailure.error,staleCardBlocked:staleCard.error,inactiveAgentBlocked:inactive.error,httpHumanApproval:'ASK -> ALLOW -> CONFIRMED',humanTransactionHash:humanExecution.execution.transactionHash,httpAuthentication:'VERIFIED',httpAuthorization:'ALLOW',httpExecution:'CONFIRMED',transactionHash:executed.execution.transactionHash,tokenDelta:'2000000000000000000',budgetDeltaWei:'200000000000000',duplicateBlocked:true,runtimeChangeBlocked:runtimeChanged.error,auditIntegrity:true};
 } finally {
  await Promise.all([new Promise<void>(resolve=>agentServer.close(()=>resolve())),new Promise<void>(resolve=>verifierServer.close(()=>resolve()))]);
  if(oldAgentPort===undefined)delete process.env.SEPOLIA_AGENT_PORT;else process.env.SEPOLIA_AGENT_PORT=oldAgentPort;
 }
});
