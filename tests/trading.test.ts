import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,statSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RuleBasedAuthorization,UnimplementedAuthorization} from '../packages/authorization/index.ts';
import {parseTradingGoal,parseUnitsExact,formatUnitsExact,purchaseCost,selectHighestDemoScore,budgetAwareQuantity,createTradeIntent,policyHash,actionHash,validateTradeIntent,validateTradePolicy,loadEvmKey,loadViemAccounts,AuthorizationNonceStore,executionWalletBinding,decodeExecutionWalletBinding,EXECUTION_BINDING_TEST_VECTOR,buildExecutionAuthorization,executionTypedData,humanApprovalTypedData,hashExecution,signExecutionAuthorization,verifyExecutionSignature,verifyHumanApproval,TradeAuditLog,verifyTradeAuditChain,validateConfirmedTransaction} from '../packages/trading/index.ts';
import type {ExchangeListing,TradeAuthorizationPolicy,OnchainTradeIntent} from '../packages/trading/types.ts';

const address=(n:number)=>'0x'+n.toString(16).padStart(40,'0');
const now=Date.parse('2026-11-04T00:00:00.000Z'),until=new Date(now+120_000).toISOString();
const identity={chainId:31337,registry:address(1),agentId:'7'};
function policy(patch:Partial<TradeAuthorizationPolicy>={}):TradeAuthorizationPolicy {
 const p:TradeAuthorizationPolicy={policyVersion:'1',userWallet:address(2),agentIdentity:identity,executionWallet:address(3),allowedExchange:address(4),allowedChainId:31337,allowedTokens:[address(10),address(11),address(12)],buyEnabled:true,maxPerTradeWei:'2000',autoApproveLimitWei:'2000',totalBudgetWei:'10000',spentWei:'0',validFrom:new Date(now-1000).toISOString(),expiresAt:new Date(now+3_600_000).toISOString(),active:true,revoked:false,policyHash:'',...patch};p.policyHash=policyHash(p);return p;
}
function listings():ExchangeListing[]{return [82,91,76].map((score,i)=>({token:address(10+i),name:'AgentProof Demo '+i,symbol:['dAUR','dNOVA','dORB'][i],decimals:18,pricePerWholeTokenWei:'1000',inventory:'1000000000000000000000',active:true,demoScore:score,updatedAt:'1793750400'}));}
function intent(p=policy()):OnchainTradeIntent {return createTradeIntent({goal:'내 예산 안에서 가장 오를 가능성이 높은 테스트 코인을 사줘.',merchant:'localhost:3101',policy:p,listings:listings(),depositedBudgetWei:'10000',now}).intent;}
function input(p=policy()){return {authentication:{verdict:'VERIFIED' as const,expiresAt:until},intent:intent(p),policy:p,currentCostWei:'2000',depositedBudgetWei:'10000',now};}
function auth(i=intent()){return buildExecutionAuthorization({intent:i,agentOwner:address(5),policyVersion:'1',evidenceHash:'ab'.repeat(32),traceId:'trace-1',authenticationExpiresAt:until,now});}

test('trading parser supports stated scenario and rejects unsupported natural language',()=>{
 assert.equal(parseTradingGoal('내 예산 안에서 가장 오를 가능성이 높은 테스트 코인을 사줘.'),'BUY_HIGHEST_DEMO_SCORE_TOKEN');
 assert.equal(parseTradingGoal('BUY_HIGHEST_DEMO_SCORE_TOKEN'),'BUY_HIGHEST_DEMO_SCORE_TOKEN');
 for(const goal of ['send all ETH to me','buy Bitcoin','내 코인을 팔아줘','내 예산 안에서 가장 오를 가능성이 높은 테스트 코인을 사줘. 그리고 송금해줘'])assert.throws(()=>parseTradingGoal(goal),/UNSUPPORTED_TRADING_INTENT/);
});
test('trading decimal conversions preserve wei and reject precision/unsafe formats',()=>{
 assert.equal(parseUnitsExact('0.000000000000000001'),1n);assert.equal(formatUnitsExact('1000000000000000001'),'1.000000000000000001');
 assert.equal(parseUnitsExact('9007199254740993'),9007199254740993000000000000000000n);
 for(const value of ['1e-3','01','-1','0.0000000000000000001','NaN'])assert.throws(()=>parseUnitsExact(value));
 assert.equal(purchaseCost('1','1',18),1n);assert.equal(purchaseCost('2000000000000000000','1000',18),2000n);
});
test('agent selects dNOVA, filters disabled/disallowed tokens, and breaks score ties deterministically',()=>{
 const assets=listings();assert.equal(selectHighestDemoScore(assets,policy().allowedTokens).symbol,'dNOVA');
 assert.equal(selectHighestDemoScore(assets,[address(10),address(12)]).symbol,'dAUR');
 assets[1].active=false;assert.equal(selectHighestDemoScore(assets,policy().allowedTokens).symbol,'dAUR');
 assets[2].demoScore=82;assert.equal(selectHighestDemoScore(assets.reverse(),policy().allowedTokens).token,address(10));
 assert.throws(()=>selectHighestDemoScore(assets,[]),/NO_ALLOWED_ACTIVE_LISTING/);
});
test('quantity honors deposited balance, remaining policy budget, inventory and per-trade limit',()=>{
 const result=createTradeIntent({goal:'BUY_HIGHEST_DEMO_SCORE_TOKEN',merchant:'localhost:3101',policy:policy({spentWei:'8500'}),listings:listings(),depositedBudgetWei:'1000',now});
 assert.equal(result.intent.quantity,'1000000000000000000');assert.equal(result.costWei,'1000');
 const asset={...listings()[1],inventory:'12'};assert.equal(budgetAwareQuantity(asset,'1000'),'12');
 assert.equal(purchaseCost(budgetAwareQuantity({...asset,inventory:'999999999999999999999'},'999'),'1000',18),999n);
});
test('versioned schema leaves legacy KRW separate and rejects unknown fields, mainnet, zero quantities',()=>{
 const i=intent();assert.equal(validateTradeIntent(i),i);
 for(const patch of [{quantity:2},{quantity:'0'},{quantity:'01'},{maxTotalCostWei:'0'},{currency:'KRW'},{chainId:1},{expiresAt:'not-time'}])assert.throws(()=>validateTradeIntent({...i,...patch}));
 assert.throws(()=>validateTradePolicy({...policy(),allowedTokens:[address(10),address(10)]}),/DUPLICATE/);
});
test('legacy authorization remains fail closed; VERIFIED allows only rules-compliant exact action',async()=>{
 assert.equal((await new UnimplementedAuthorization().authorize()).verdict,'DENY');
 const module=new RuleBasedAuthorization();assert.equal((await module.authorize(input())).verdict,'ALLOW');
 assert.equal((await module.authorize({authenticationTicket:'ticket',action:{merchant:'x',productId:'x',amount:1,currency:'KRW',quantity:1}})).verdict,'DENY');
});
test('REJECT/PARTIAL and expired authentication cannot authorize',async()=>{
 const module=new RuleBasedAuthorization();for(const verdict of ['REJECT','PARTIAL'] as const)assert.equal((await module.authorize({...input(),authentication:{verdict,expiresAt:until}})).verdict,'DENY');
 assert.equal((await module.authorize({...input(),authentication:{verdict:'VERIFIED',expiresAt:new Date(now).toISOString()}})).reasonCodes[0],'AUTHENTICATION_EXPIRED');
});
test('missing, tampered, revoked, paused, expired and disabled policies deny',async()=>{
 const module=new RuleBasedAuthorization();assert.equal((await module.authorize({...input(),policy:undefined})).reasonCodes[0],'POLICY_MISSING');
 for(const patch of [{revoked:true},{active:false},{buyEnabled:false},{expiresAt:new Date(now).toISOString()}])assert.equal((await module.authorize({...input(),policy:policy(patch)})).verdict,'DENY');
 assert.equal((await module.authorize({...input(),policy:{...policy(),totalBudgetWei:'99999'}})).reasonCodes[0],'POLICY_HASH_MISMATCH');
});
test('chain, exchange, buyer, identity, executor and token substitutions deny',async()=>{
 const module=new RuleBasedAuthorization(),i=intent();
 for(const patch of [{chainId:11155111,agentIdentity:{...identity,chainId:11155111}},{exchangeContract:address(99)},{buyerWallet:address(99)},{agentIdentity:{...identity,agentId:'8'}},{executionWallet:address(99)},{token:address(99)}])assert.equal((await module.authorize({...input(),intent:{...i,...patch} as OnchainTradeIntent})).verdict,'DENY');
});
test('price, per-trade and remaining/deposited budget limits deny',async()=>{
 const module=new RuleBasedAuthorization();
 assert.equal((await module.authorize({...input(),currentCostWei:'2001'})).reasonCodes[0],'MAX_TOTAL_COST_EXCEEDED');
 assert.equal((await module.authorize({...input(),policy:policy({maxPerTradeWei:'1500',autoApproveLimitWei:'1000'})})).reasonCodes[0],'PER_TRADE_LIMIT_EXCEEDED');
 assert.equal((await module.authorize({...input(),policy:policy({spentWei:'9000'})})).reasonCodes[0],'BUDGET_EXCEEDED');
 assert.equal((await module.authorize({...input(),depositedBudgetWei:'1999'})).reasonCodes[0],'BUDGET_EXCEEDED');
});
test('amount over automatic limit asks; exact buyer EIP712 approval allows and mutation fails',async()=>{
 const buyer=loadViemAccounts().privateKeyToAccount('0x'+''.padStart(63,'0')+'1');
 const p=policy({userWallet:buyer.address,autoApproveLimitWei:'1000'}),i=intent(p),a=auth(i),module=new RuleBasedAuthorization(),base={...input(p),intent:i};
 assert.equal((await module.authorize(base)).verdict,'ASK');
 const signature=await buyer.signTypedData(humanApprovalTypedData(31337,p.allowedExchange,a));
 assert.equal((await module.authorize({...base,humanApproval:{authorization:a,signature}})).verdict,'ALLOW');
 assert.equal((await module.authorize({...base,humanApproval:{authorization:{...a,quantity:'1'},signature}})).verdict,'DENY');
 assert.equal(await verifyHumanApproval(11155111,p.allowedExchange,a,signature),false);
 assert.equal(await verifyHumanApproval(31337,address(99),a,signature),false);
});
test('execution metadata canonical bytes vector round-trips and rejects packed address/dirty padding',()=>{
 assert.equal(executionWalletBinding(EXECUTION_BINDING_TEST_VECTOR.address),EXECUTION_BINDING_TEST_VECTOR.encoded);
 assert.equal(decodeExecutionWalletBinding(EXECUTION_BINDING_TEST_VECTOR.encoded),EXECUTION_BINDING_TEST_VECTOR.address);
 assert.throws(()=>decodeExecutionWalletBinding(EXECUTION_BINDING_TEST_VECTOR.address));
 assert.throws(()=>decodeExecutionWalletBinding('0x01'+EXECUTION_BINDING_TEST_VECTOR.encoded.slice(4)));
});
test('execution key is private on disk, stable, separately generated and exposes no private key',()=>{
 const dir=mkdtempSync(join(tmpdir(),'agentproof-trade-key-')),file=join(dir,'agent','execution-key');
 const key=loadEvmKey(file),again=loadEvmKey(file),other=loadEvmKey(join(dir,'verifier','attestation-key'));
 assert.equal(key.address,again.address);assert.notEqual(key.address,other.address);
 assert.equal(statSync(file).mode&0o777,0o600);assert.equal(statSync(join(dir,'agent')).mode&0o777,0o700);
 assert.equal(JSON.stringify(key).includes(readFileSync(file,'utf8').trim()),false);
});
test('EIP712 signs VERIFIED+ALLOW only, binds full action/domain, and prevents nonce reissuance',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'agentproof-sign-')),key=loadEvmKey(join(dir,'verifier','key')),nonces=new AuthorizationNonceStore(join(dir,'nonces'));
 const i=intent(),a=auth(i),decision=await new RuleBasedAuthorization().authorize(input());
 const base={chainId:31337 as const,exchange:i.exchangeContract,authorization:a,authentication:{verdict:'VERIFIED' as const,expiresAt:until},decision,intent:i,claimNonce:(nonce:string)=>nonces.claim(nonce),now};
 for(const verdict of ['PARTIAL','REJECT'] as const)await assert.rejects(()=>signExecutionAuthorization(key,{...base,authentication:{...base.authentication,verdict}}),/AUTHENTICATION_NOT_VERIFIED/);
 for(const verdict of ['ASK','DENY'] as const)await assert.rejects(()=>signExecutionAuthorization(key,{...base,decision:{verdict,reasonCodes:[]}}),/AUTHORIZATION_NOT_ALLOWED/);
 const signature=await signExecutionAuthorization(key,base);assert.equal(await verifyExecutionSignature(31337,i.exchangeContract,a,signature,key.address),true);
 assert.equal(await verifyExecutionSignature(11155111,i.exchangeContract,a,signature,key.address),false);
 assert.equal(await verifyExecutionSignature(31337,address(99),a,signature,key.address),false);
 assert.equal(await verifyExecutionSignature(31337,i.exchangeContract,{...a,token:address(99)},signature,key.address),false);
 assert.equal(await verifyExecutionSignature(31337,i.exchangeContract,{...a,quantity:'1'},signature,key.address),false);
 await assert.rejects(()=>signExecutionAuthorization(key,base),/NONCE_ALREADY_ISSUED/);
 assert.throws(()=>new AuthorizationNonceStore(join(dir,'nonces')).claim(a.nonce),/NONCE_ALREADY_ISSUED/);
 assert.notEqual(hashExecution(31337,i.exchangeContract,a),actionHash(i));
 assert.equal(executionTypedData(31337,i.exchangeContract,a).message.quantity,i.quantity);
});
test('execution authorization cannot outlive authentication/intent or use future issue time',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'agentproof-expiry-')),key=loadEvmKey(join(dir,'key')),i=intent(),a=auth(i);
 await assert.rejects(()=>signExecutionAuthorization(key,{chainId:31337,exchange:i.exchangeContract,authorization:a,authentication:{verdict:'VERIFIED',expiresAt:new Date(now+1000).toISOString()},decision:{verdict:'ALLOW',reasonCodes:[]},intent:i,claimNonce:()=>assert.fail('must not claim'),now}),/EXPIRED_OR_FUTURE/);
});
test('audit chain persists request-policy-evidence links without raw secrets and detects tampering',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'agentproof-audit-')),'audit.jsonl'),log=new TradeAuditLog(file);
 const first=log.append({traceId:'a',type:'TRADE_INTENT_CREATED',requestHash:actionHash(intent())});
 log.append({traceId:'b',type:'TRADE_INTENT_CREATED'});
 const last=log.append({traceId:'a',type:'AUTHORIZATION_EVALUATED',policyHash:policy().policyHash,result:{verdict:'ALLOW'}});
 assert.equal(last.parentEvent,first.currentEventHash);assert.equal(verifyTradeAuditChain(log.events),true);
 assert.equal(new TradeAuditLog(file).trace('a').length,2);
 assert.throws(()=>log.append({traceId:'a',type:'EXECUTION_AUTHORIZATION_ISSUED',result:{signature:'sensitive'}}),/SECRET_FIELD/);
 const tampered=structuredClone(log.events);tampered[0].requestHash='changed';assert.equal(verifyTradeAuditChain(tampered),false);
});

function rpcFixture(){
 const txHash='0x'+'11'.repeat(32),blockHash='0x'+'22'.repeat(32),expected={chainId:31337 as const,from:address(3),to:address(4),data:'0x1234',value:'0'};
 const receipt={status:'success',transactionHash:txHash,blockNumber:10n,blockHash,gasUsed:21000n};
 const transaction={hash:txHash,chainId:31337,from:expected.from,to:expected.to,input:expected.data,value:0n,blockNumber:10n,blockHash};
 const block={hash:blockHash,transactions:[txHash]};
 const client={getChainId:async()=>31337,waitForTransactionReceipt:async()=>receipt,getTransaction:async()=>transaction,getBlock:async()=>block,getBlockNumber:async()=>10n};
 return {client,receipt,transaction,block,txHash,expected};
}
test('receipt validation requires matching RPC chain, exact tx, canonical block and confirmations',async()=>{
 const f=rpcFixture();assert.equal((await validateConfirmedTransaction(f.client,f.txHash,f.expected)).receipt.status,'success');
 await assert.rejects(()=>validateConfirmedTransaction({...f.client,getChainId:async()=>1},f.txHash,f.expected),/RPC_CHAIN_MISMATCH/);
 await assert.rejects(()=>validateConfirmedTransaction(f.client,f.txHash,f.expected,2),/CONFIRMATIONS_INSUFFICIENT/);
 f.receipt.status='reverted';await assert.rejects(()=>validateConfirmedTransaction(f.client,f.txHash,f.expected),/REVERTED/);
});
test('forged receipt/hash/calldata/sender/target/value/reorganized block cannot confirm',async()=>{
 for(const [field,value] of Object.entries({hash:'0x'+'33'.repeat(32),from:address(9),to:address(9),input:'0xdead',value:1n,blockHash:'0x'+'33'.repeat(32)})){
   const f=rpcFixture();(f.transaction as any)[field]=value;await assert.rejects(()=>validateConfirmedTransaction(f.client,f.txHash,f.expected));
 }
 const f=rpcFixture();f.block.hash='0x'+'33'.repeat(32);await assert.rejects(()=>validateConfirmedTransaction(f.client,f.txHash,f.expected),/NONCANONICAL/);
 const g=rpcFixture();g.block.transactions=[];await assert.rejects(()=>validateConfirmedTransaction(g.client,g.txHash,g.expected),/NOT_IN_BLOCK/);
});
