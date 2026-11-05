/** Real deployment and administration API transactions on disposable Anvil only.
 * Local generated test accounts replace MetaMask exclusively in this test harness.
 * No Sepolia wallet, user key, or external transaction is used.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {runAnvilE2E} from './trade-anvil-e2e.ts';
import {exchangeHandlers} from '../services/exchange-service/server.ts';
import {TradingChain,SUPPLY} from '../services/common/trading-chain.ts';
import {serve,reply} from '../services/common/http.ts';
import {loadViem} from '../packages/erc8004-filter/viem-reader.ts';
import {executionTypedData} from '../packages/trading/eip712.ts';
import {randomHex} from '../packages/crypto/index.ts';

async function freePort(){return new Promise<number>((resolve,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();if(!a||typeof a==='string')throw new Error('PORT');s.close(()=>resolve(a.port));});});}
await runAnvilE2E(async context=>{
 const {state,rpcUrl,registry,client,keys,wallets,artifact,write}=context,v=loadViem();
 const chain=new TradingChain({rpcUrl,chainId:31337,registry,stateRoot:join(state,'exchange-api')});
 const handlers=exchangeHandlers(chain,async()=>keys.verifier.address);
 const port=await freePort(),origin=`http://127.0.0.1:${port}`;
 const server=await serve(port,async r=>{
  let result:any;
  if(r.method==='GET'&&r.path==='/api/exchange/config')result=await handlers.config();
  else if(r.method==='GET'&&r.path==='/api/exchange/listings')result={listings:chain.config().exchangeContract?await chain.listings():[]};
  else if(r.method==='GET'&&r.path==='/api/exchange/trades')result=await handlers.trades();
  else if(r.method==='POST'&&r.path==='/api/exchange/deployment/prepare')result=await handlers.prepare(r.json);
  else if(r.method==='POST'&&r.path==='/api/exchange/deployment/confirm')result=await handlers.confirm(r.json);
  else if(r.method==='POST'&&r.path==='/api/exchange/admin/prepare')result=await handlers.adminPrepare(r.json);
  else return;
  reply(r.res,200,result);
 });
 const transactions:any[]=[];
 try{
  async function api(path:string,body?:any,ok=true){const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value:any=await response.json();if(ok)assert.equal(response.status,200,`${path}: ${JSON.stringify(value)}`);else assert.ok(response.status>=400,`${path} unexpectedly accepted invalid request`);return value;}
  async function sendPrepared(prepared:any,expectedFunction?:string){
   const tx=prepared.transaction;
   assert.equal(tx.chainId,'0x7a69','test must never prepare Sepolia or mainnet transactions');
   assert.equal(tx.from.toLowerCase(),keys.merchant.address.toLowerCase());
   if(expectedFunction){const decoded=v.decodeFunctionData({abi:expectedFunction==='approve'?v.erc20Abi:artifact('AgentProofDemoExchange').abi,data:tx.data});assert.equal(decoded.functionName,expectedFunction);}
   const transactionHash=await wallets.merchant.sendTransaction({to:tx.to,data:tx.data,value:BigInt(tx.value??0)});
   const result=await api('/api/exchange/deployment/confirm',{preparationId:prepared.preparationId,transactionHash});
   assert.equal(result.status,'CONFIRMED');assert.equal(result.transactionHash,transactionHash);
   const receipt=await client.getTransactionReceipt({hash:transactionHash});assert.equal(receipt.status,'success');assert.equal(String(receipt.blockNumber),result.blockNumber);
   transactions.push({label:prepared.label,transactionHash,blockNumber:result.blockNumber});
   return {...result,receipt};
  }
  async function admin(action:string,args:any={},expectedFunction?:string){const prepared=await api('/api/exchange/admin/prepare',{wallet:keys.merchant.address,action,...args});return sendPrepared(prepared,expectedFunction);}

  const initial=await api('/api/exchange/config');
  assert.equal(initial.chainId,31337);assert.equal(initial.exchangeContract,null);assert.equal(initial.buildReady,true);assert.equal(initial.sourceVerification,'NOT_VERIFIED');assert.equal(initial.deploymentStatus,'READY_AWAITING_METAMASK');assert.equal(initial.tokens.length,3);assert.equal(initial.owner,null);assert.equal(initial.paused,null);assert.equal(initial.merchantProceedsWei,null);
  assert.deepEqual((await api('/api/exchange/listings')).listings,[]);assert.deepEqual((await api('/api/exchange/trades')).trades,[]);
  const preparedExchange=await api('/api/exchange/deployment/prepare',{kind:'exchange',wallet:keys.merchant.address});
  assert.equal(preparedExchange.transaction.to,undefined);
  const deployment=await sendPrepared(preparedExchange),exchange=deployment.contractAddress;assert.match(exchange,/^0x[0-9a-fA-F]{40}$/);
  const configured=await api('/api/exchange/config');assert.equal(configured.exchangeContract,exchange);assert.equal(configured.owner.toLowerCase(),keys.merchant.address.toLowerCase());assert.equal(configured.trustedVerifier.toLowerCase(),keys.verifier.address.toLowerCase());assert.equal(configured.paused,false);assert.equal(configured.merchantProceedsWei,'0');assert.equal(configured.sourceVerification,'NOT_VERIFIED');assert.deepEqual(configured.constructorArguments,[keys.merchant.address,keys.verifier.address,registry]);assert.equal(configured.chainError,null);
  assert.equal((await api('/api/exchange/deployment/prepare',{kind:'exchange',wallet:keys.merchant.address},false)).error,'EXCHANGE_ALREADY_DEPLOYED');
  assert.equal((await api('/api/exchange/deployment/prepare',{kind:'token',wallet:keys.buyer.address,tokenIndex:0},false)).error,'MERCHANT_OWNER_REQUIRED');
  assert.equal((await api('/api/exchange/admin/prepare',{wallet:keys.buyer.address,action:'pause'},false)).error,'MERCHANT_OWNER_REQUIRED');
  assert.equal((await api('/api/exchange/deployment/prepare',{kind:'token',wallet:keys.merchant.address,tokenIndex:3},false)).error,'SCHEMA_INVALID');

  const tokens:string[]=[];let firstTokenHash='';
  for(let tokenIndex=0;tokenIndex<3;tokenIndex++){
   const prepared=await api('/api/exchange/deployment/prepare',{kind:'token',wallet:keys.merchant.address,tokenIndex});
   const tokenDeployment=await sendPrepared(prepared);tokens.push(tokenDeployment.contractAddress);
   if(tokenIndex===0)firstTokenHash=tokenDeployment.transactionHash;
   assert.equal(await client.readContract({address:tokens[tokenIndex],abi:v.erc20Abi,functionName:'totalSupply'}),BigInt(SUPPLY));
   assert.equal(await client.readContract({address:tokens[tokenIndex],abi:v.erc20Abi,functionName:'balanceOf',args:[exchange]}),BigInt(SUPPLY));
   const listing=await api('/api/exchange/deployment/prepare',{kind:'listing',wallet:keys.merchant.address,tokenIndex});await sendPrepared(listing,'addListing');
  }
  assert.equal((await api('/api/exchange/deployment/prepare',{kind:'token',wallet:keys.merchant.address,tokenIndex:0},false)).error,'TOKEN_ALREADY_DEPLOYED');
  // A real but unrelated deployment hash cannot confirm a prepared Exchange deployment.
  assert.equal((await api('/api/exchange/deployment/confirm',{preparationId:preparedExchange.preparationId,transactionHash:firstTokenHash},false)).error,'TRANSACTION_CALLDATA_MISMATCH');
  const listings=(await api('/api/exchange/listings')).listings;
  assert.deepEqual(listings.map((x:any)=>x.symbol),['dAUR','dNOVA','dORB']);assert.deepEqual(listings.map((x:any)=>x.demoScore),[82,91,76]);assert.ok(listings.every((x:any)=>x.active&&x.inventory===SUPPLY&&x.decimals===18&&x.pricePerTokenWei==='100000000000000'&&x.evidenceLabel==='ON-CHAIN'));
  const deployedConfig=await api('/api/exchange/config');assert.deepEqual(deployedConfig.tokens.map((x:any)=>x.address),tokens);assert.equal(deployedConfig.sourceVerification,'NOT_VERIFIED');

  await admin('update-listing',{token:tokens[1],pricePerTokenWei:'150000000000000',demoScore:95,active:false},'updateListing');
  const disabled=(await api('/api/exchange/listings')).listings[1];assert.equal(disabled.pricePerTokenWei,'150000000000000');assert.equal(disabled.demoScore,95);assert.equal(disabled.active,false);
  await admin('update-listing',{token:tokens[1],pricePerTokenWei:'100000000000000',demoScore:91,active:true},'updateListing');
  await admin('pause',{},'pauseExchange');assert.equal((await api('/api/exchange/config')).paused,true);
  await admin('unpause',{},'unpauseExchange');assert.equal((await api('/api/exchange/config')).paused,false);
  await admin('set-verifier',{verifier:keys.agentOwner.address},'setTrustedVerifier');const rotated=await api('/api/exchange/config');assert.equal(rotated.trustedVerifier.toLowerCase(),keys.agentOwner.address.toLowerCase());assert.equal(rotated.verifierAddress.toLowerCase(),keys.verifier.address.toLowerCase());
  await admin('set-verifier',{verifier:keys.verifier.address},'setTrustedVerifier');

  // Produce genuine merchant revenue and merchant-owned inventory through a local purchase.
  const abi=artifact('AgentProofDemoExchange').abi,now=(await client.getBlock()).timestamp;
  await write('buyer',exchange,abi,'configurePolicy',[7n,keys.executor.address,true,200000000000000n,200000000000000n,1000000000000000n,now+3600n]);
  await write('buyer',exchange,abi,'setTokenAllowed',[tokens[1],true]);
  await write('buyer',exchange,abi,'depositBudget',[],1000000000000000n);
  const policy=await chain.policy(keys.buyer.address);
  const authorization={registry,agentId:'7',agentOwner:keys.agentOwner.address,executionWallet:keys.executor.address,buyer:keys.buyer.address,token:tokens[1],quantity:'2000000000000000000',maxTotalCostWei:'200000000000000',policyVersion:policy.policyVersion,evidenceHash:'0x'+randomHex(32),traceId:'0x'+randomHex(32),nonce:'0x'+randomHex(32),issuedAt:String(now),expiresAt:String(now+90n)};
  const signature=await keys.verifier.signTypedData(executionTypedData(31337,exchange,authorization));
  const purchase=await write('executor',exchange,abi,'buyWithAuthorization',[authorization,signature,'0x']);
  assert.equal((await api('/api/exchange/config')).merchantProceedsWei,'200000000000000');
  const activity=await api('/api/exchange/trades');assert.equal(activity.trades.length,1);assert.equal(activity.trades[0].transactionHash,purchase.transactionHash);assert.equal(activity.trades[0].eventName,'VerifiedAgentPurchase');assert.equal(activity.trades[0].quantity,'2000000000000000000');assert.equal(activity.trades[0].totalCostWei,'200000000000000');assert.equal(activity.trades[0].user.toLowerCase(),keys.buyer.address.toLowerCase());assert.equal(activity.trades[0].executionWallet.toLowerCase(),keys.executor.address.toLowerCase());
  await write('buyer',tokens[1],v.erc20Abi,'transfer',[keys.merchant.address,10n**18n]);
  await admin('approve-inventory',{token:tokens[1],amountWei:'1000000000000000000'},'approve');
  assert.equal(await client.readContract({address:tokens[1],abi:v.erc20Abi,functionName:'allowance',args:[keys.merchant.address,exchange]}),10n**18n);
  const inventoryBefore=BigInt((await api('/api/exchange/listings')).listings[1].inventory);
  await admin('deposit-inventory',{token:tokens[1],amountWei:'1000000000000000000'},'depositInventory');
  assert.equal(BigInt((await api('/api/exchange/listings')).listings[1].inventory)-inventoryBefore,10n**18n);
  assert.equal(await client.readContract({address:tokens[1],abi:v.erc20Abi,functionName:'balanceOf',args:[keys.merchant.address]}),0n);
  const merchantBefore=await client.getBalance({address:keys.merchant.address});
  const withdrawal=await admin('withdraw-proceeds',{amountWei:'200000000000000'},'withdrawMerchantProceeds');
  const merchantAfter=await client.getBalance({address:keys.merchant.address});assert.equal(merchantAfter-merchantBefore+withdrawal.receipt.gasUsed*withdrawal.receipt.effectiveGasPrice,200000000000000n);
  assert.equal((await api('/api/exchange/config')).merchantProceedsWei,'0');assert.equal(await chain.read('budgets',[keys.buyer.address]),800000000000000n,'merchant must never withdraw user budget');
  const result={network:'ANVIL ONLY',chainId:31337,deployment:'Exchange + 3 fixed-supply Demo Tokens + 3 listings',exchange,tokenSymbols:listings.map((x:any)=>x.symbol),preparedTransactionsConfirmed:transactions.length,transactions,adminActions:['update-listing','approve-inventory','deposit-inventory','withdraw-proceeds','set-verifier','pause','unpause'],unauthorizedAdminBlocked:true,wrongReceiptBlocked:true,sourceVerification:'NOT_VERIFIED',actualPurchaseHash:purchase.transactionHash,merchantProceedsWithdrawnWei:'200000000000000',inventoryAdded:'1000000000000000000',userBudgetPreservedWei:'800000000000000'};
  mkdirSync('test-results',{recursive:true});writeFileSync('test-results/exchange-service.json',JSON.stringify(result,null,2)+'\n');
  return result;
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
