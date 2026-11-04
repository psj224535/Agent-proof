/** Actual local-chain E2E. Never reads user keys or spends Sepolia funds. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadViem} from '../packages/erc8004-filter/viem-reader.ts';
import {SQLite} from '../packages/storage/sql.ts';
import {Store} from '../packages/storage/store.ts';
import {Verifier} from '../packages/verification-core/engine.ts';
import {SourceUnavailable} from '../packages/verification-core/errors.ts';
import {keyPair,hash,sha256,randomHex,canonical,signBytes,without} from '../packages/crypto/index.ts';
import {createDocuments,createAttestation,statusDocument,addProof,authenticateTransport,TEST_ISSUER} from '../packages/agent-kit/index.ts';
import {bundleHash} from '../packages/aps-passport-filter/passport.ts';
import {RuleBasedAuthorization} from '../packages/authorization/index.ts';
import {loadEvmKey,AuthorizationNonceStore,executionWalletBinding,executionTypedData,humanApprovalTypedData,hashExecution,buildExecutionAuthorization,signExecutionAuthorization,createTradeIntent,policyHash,actionHash,validateConfirmedTransaction,purchaseEvidence,TradeAuditLog,verifyTradeAuditChain,EXECUTION_BINDING_TEST_VECTOR} from '../packages/trading/index.ts';
import type {TradeAuthorizationPolicy,OnchainTradeIntent,AuthenticationState,ExecutionAuthorization} from '../packages/trading/types.ts';
import type {Presentation,RegistrySnapshot} from '../packages/shared-schemas/types.ts';
import {TradingChain,savePrivate} from '../services/common/trading-chain.ts';

export async function runAnvilE2E(serviceHook?:(context:any)=>Promise<unknown>) {
const v=loadViem(),state=mkdtempSync(join(tmpdir(),'agentproof-anvil-e2e-'));
const port=await new Promise<number>((resolvePort,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string')throw new Error('PORT_UNAVAILABLE');server.close(()=>resolvePort(address.port));});});
const rpcUrl=`http://127.0.0.1:${port}`;
const processAnvil=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--silent'],{stdio:['ignore','ignore','pipe']});
let anvilError='';processAnvil.stderr.on('data',chunk=>{anvilError+=String(chunk);});
processAnvil.on('error',error=>{anvilError=String(error);});
const chain={id:31337,name:'AgentProof disposable Anvil',nativeCurrency:{name:'Test ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpcUrl]}}};
const client=v.createPublicClient({chain,transport:v.http(rpcUrl,{retryCount:0,timeout:3000}),pollingInterval:25,cacheTime:0});
let store:Store|undefined;
try {
 for(let i=0;i<100;i++){try{if(await client.getChainId()===31337)break;}catch{}if(i===99)throw new Error('ANVIL_START_FAILED: '+anvilError);await new Promise(r=>setTimeout(r,50));}
 const keys=Object.fromEntries(['merchant','buyer','agentOwner','executor','verifier'].map(role=>[role,loadEvmKey(join(state,role,'evm.key'))]));
 const wallets=Object.fromEntries(Object.entries(keys).map(([role,key])=>[role,v.createWalletClient({account:key.account,chain,transport:v.http(rpcUrl),pollingInterval:25})]));
 for(const role of ['merchant','buyer','executor'])await client.request({method:'anvil_setBalance',params:[keys[role].address,v.toHex(10n**20n)]});
 const artifact=(name:string)=>JSON.parse(readFileSync(resolve('contracts/out',name+'.sol',name+'.json'),'utf8'));
 const exchangeArtifact=artifact('AgentProofDemoExchange'),registryArtifact=artifact('MockIdentityRegistry'),tokenArtifact=artifact('DemoToken');
 const receipt=async(hash:string)=>{const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return r;};
 async function deploy(role:string,a:any,args:any[]){const r=await receipt(await wallets[role].deployContract({abi:a.abi,bytecode:a.bytecode.object,args}));assert.ok(r.contractAddress);return r.contractAddress;}
 async function write(role:string,address:string,abi:any,functionName:string,args:any[]=[],value=0n){return receipt(await wallets[role].writeContract({address,abi,functionName,args,value}));}
 const registry=await deploy('merchant',registryArtifact,[]);
 const exchange=await deploy('merchant',exchangeArtifact,[keys.merchant.address,keys.verifier.address,registry]);
 const tokens=[];
 for(const [name,symbol,score] of [['Aurora','dAUR',82],['Nova','dNOVA',91],['Orbit','dORB',76]] as const){const token=await deploy('merchant',tokenArtifact,[name,symbol,exchange]);await write('merchant',exchange,exchangeArtifact.abi,'addListing',[token,100_000_000_000_000n,BigInt(score)]);tokens.push(token);}
 const now=Number((await client.getBlock()).timestamp)*1000;
 const documents=createDocuments({agentOrigin:'https://agent.anvil.test',agentId:'7',chainId:31337,registry,ownerAddress:keys.agentOwner.address,now});
 documents.card.capabilities.extensions.push({uri:'https://agentproof.example/extensions/execution-wallet/v1',required:false,params:{...documents.binding,chainId:31337,registry,agentId:'7',executionWallet:keys.executor.address,metadataKey:'agentproof.executionWallet.v1',encoding:'abi.encode(address)'}});
 const unsigned=without(documents.card,'signatures');const header=Buffer.from(canonical({alg:'EdDSA',kid:documents.key.keyId,typ:'JOSE'})).toString('base64url');documents.card.signatures=[{protected:header,signature:signBytes(documents.key,Buffer.from(header+'.'+Buffer.from(canonical(unsigned)).toString('base64url')))}];
 const issuer=keyPair();documents.attestation=createAttestation(documents,issuer,'https://issuer.anvil.test',now);
 await write('merchant',registry,registryArtifact.abi,'setOwner',[7n,keys.agentOwner.address]);
 await write('merchant',registry,registryArtifact.abi,'setURI',[7n,documents.snapshot.agentURI]);
 await write('merchant',registry,registryArtifact.abi,'setMetadata',[7n,'agentproof.runtimeBinding.v1','0x'+hash(documents.binding)]);
 await write('merchant',registry,registryArtifact.abi,'setMetadata',[7n,'agentproof.executionWallet.v1',executionWalletBinding(keys.executor.address)]);
 assert.equal(executionWalletBinding(EXECUTION_BINDING_TEST_VECTOR.address),EXECUTION_BINDING_TEST_VECTOR.encoded);
 await write('buyer',exchange,exchangeArtifact.abi,'depositBudget',[],1_000_000_000_000_000n);
 await write('buyer',exchange,exchangeArtifact.abi,'configurePolicy',[7n,keys.executor.address,true,200_000_000_000_000n,200_000_000_000_000n,1_000_000_000_000_000n,BigInt(now/1000+3600)]);
 for(const token of tokens)await write('buyer',exchange,exchangeArtifact.abi,'setTokenAllowed',[token,true]);
 savePrivate(join(state,'exchange','deployment.json'),{exchangeContract:exchange});
 const tradingChain=new TradingChain({rpcUrl,chainId:31337,registry,stateRoot:state});
 const listings=await tradingChain.listings();assert.equal(listings.length,3);
 const raw=await tradingChain.policy(keys.buyer.address);
 const policy:TradeAuthorizationPolicy={policyVersion:raw.policyVersion,userWallet:keys.buyer.address,agentIdentity:documents.identity,executionWallet:keys.executor.address,allowedExchange:exchange,allowedChainId:31337,allowedTokens:tokens,buyEnabled:true,maxPerTradeWei:raw.maxPerTradeWei,autoApproveLimitWei:raw.autoApproveLimitWei,totalBudgetWei:raw.totalBudgetWei,spentWei:raw.spentWei,validFrom:new Date(0).toISOString(),expiresAt:raw.expiresAt,active:true,revoked:false,policyHash:''};policy.policyHash=policyHash(policy);
 const selected=createTradeIntent({goal:'내 예산 안에서 가장 오를 가능성이 높은 테스트 코인을 사줘.',merchant:'verifier.anvil.test',policy,listings,depositedBudgetWei:String(await tradingChain.read('budgets',[keys.buyer.address])),now});
 assert.equal(selected.listing.symbol,'dNOVA');assert.equal(selected.intent.quantity,'2000000000000000000');
 const flags={cardUnavailable:false};
 store=new Store(new SQLite(join(state,'verifier.sqlite')));await store.init();
 const registryReader={async read(identity:typeof documents.identity):Promise<RegistrySnapshot|null>{
  const block=await client.getBlock();
  const read=(functionName:string,args:any[])=>client.readContract({address:registry,abi:registryArtifact.abi,functionName,args,blockNumber:block.number});
  const [owner,uri,binding]=await Promise.all([read('ownerOf',[BigInt(identity.agentId)]),read('tokenURI',[BigInt(identity.agentId)]),read('getMetadata',[BigInt(identity.agentId),'agentproof.runtimeBinding.v1'])]);
  if(owner===v.zeroAddress)return null;
  assert.equal((await client.getBlock({blockNumber:block.number})).hash,block.hash);
  return {identity,owner,agentWallet:owner,agentURI:uri,runtimeBindingHash:binding.slice(2),blockNumber:String(block.number),blockHash:block.hash,abiVersion:'ANVIL-TEST-FIXTURE',source:'anvil'};
 }};
 const verifier=new Verifier({store,registryReader,ticketKey:keyPair(),chainId:31337,registryAddress:registry,audience:'verifier.anvil.test',development:true,now:()=>now,trust:{issuers:{[TEST_ISSUER]:{publicKeyMultibase:issuer.publicKeyMultibase,statusOrigin:'https://issuer.anvil.test',testIssuer:true}}},fetcher:{async json(url){
  let value:unknown;
  if(url===documents.snapshot.agentURI)value=documents.registration;
  else if(url===documents.registration.services[0].endpoint){if(flags.cardUnavailable)throw new SourceUnavailable();value=documents.card;}
  else if(url===documents.attestation!.statusUri)value=statusDocument(documents.attestation!,issuer,'ACTIVE',now);
  else throw new SourceUnavailable();
  return {value:structuredClone(value),sourceUrl:url,sourceHash:sha256(JSON.stringify(value)),fetchedAt:new Date(now).toISOString()};
 }}});
 async function authenticate(intent:OnchainTradeIntent,mutate?:(p:Presentation<OnchainTradeIntent>)=>void){
  const p:Presentation<OnchainTradeIntent>={presentationVersion:'agentproof-presentation-v1',requestId:randomUUID(),claimedIdentity:documents.identity,presentedAgentCard:structuredClone(documents.card),presentedPassport:documents.passport,companyAttestation:documents.attestation,tapRequest:intent,submittedAt:new Date(now).toISOString(),bundleHash:''};mutate?.(p);p.bundleHash=bundleHash(p);
  const challenge=await verifier.challenge({subjectAgent:p.claimedIdentity,runtimeKeyId:documents.key.keyId,requestId:p.requestId,requestHash:p.bundleHash});addProof(p,challenge,documents.key);
  return verifier.authenticate(p,authenticateTransport(p,documents.key,'verifier.anvil.test'));
 }
 const authenticated=await authenticate(selected.intent);assert.equal(authenticated.verdict,'VERIFIED',JSON.stringify(authenticated.reasonCodes));assert.ok(authenticated.modules.every(m=>m.status==='PASS'));
 const authentication:AuthenticationState={verdict:authenticated.verdict,expiresAt:authenticated.ticketExpiresAt!,evidenceHash:authenticated.evidenceBundleHash};
 const rules=new RuleBasedAuthorization(),input={authentication,intent:selected.intent,policy,currentCostWei:selected.costWei,depositedBudgetWei:String(await tradingChain.read('budgets',[keys.buyer.address])),now};
 const decision=await rules.authorize(input);assert.equal(decision.verdict,'ALLOW',JSON.stringify(decision));
 const authorization=buildExecutionAuthorization({intent:selected.intent,agentOwner:keys.agentOwner.address,policyVersion:policy.policyVersion,evidenceHash:authenticated.evidenceBundleHash,traceId:authenticated.traceId,authenticationExpiresAt:authentication.expiresAt,now});
 assert.equal(hashExecution(31337,exchange,authorization),await tradingChain.read('hashExecution',[authorization]));
 assert.equal(v.hashTypedData(humanApprovalTypedData(31337,exchange,authorization)),await tradingChain.read('hashHumanApproval',[authorization]));
 const nonceStore=new AuthorizationNonceStore(join(state,'nonces'));
 const signature=await signExecutionAuthorization(keys.verifier,{chainId:31337,exchange,authorization,authentication,decision,intent:selected.intent,claimNonce:nonce=>nonceStore.claim(nonce),now});
 await assert.rejects(()=>signExecutionAuthorization(keys.verifier,{chainId:31337,exchange,authorization,authentication,decision,intent:selected.intent,claimNonce:nonce=>nonceStore.claim(nonce),now}),/NONCE_ALREADY_ISSUED/);
 const audit=new TradeAuditLog(join(state,'trade-audit.jsonl'));
 const auditBase={traceId:authenticated.traceId,requestHash:actionHash(selected.intent),policyHash:policy.policyHash,evidenceHash:authenticated.evidenceBundleHash};
 audit.append({...auditBase,type:'TRADE_INTENT_CREATED',result:{token:selected.intent.token,quantity:selected.intent.quantity}});
 audit.append({...auditBase,type:'AUTHENTICATION_COMPLETED',result:{verdict:authenticated.verdict,authenticationTrace:authenticated.traceId}});
 audit.append({...auditBase,type:'AUTHORIZATION_EVALUATED',result:decision});
 audit.append({...auditBase,type:'EXECUTION_AUTHORIZATION_ISSUED',result:{digest:hashExecution(31337,exchange,authorization)}});
 const before=await tradingChain.snapshot(keys.buyer.address,selected.intent.token);
 const data=v.encodeFunctionData({abi:exchangeArtifact.abi,functionName:'buyWithAuthorization',args:[authorization,signature,'0x']});
 await client.simulateContract({address:exchange,abi:exchangeArtifact.abi,functionName:'buyWithAuthorization',args:[authorization,signature,'0x'],account:keys.executor.address});
 const txHash=await wallets.executor.sendTransaction({to:exchange,data,value:0n});
 audit.append({...auditBase,type:'TRANSACTION_SUBMITTED',transactionHash:txHash});
 const expected={chainId:31337 as const,from:keys.executor.address,to:exchange,data,value:'0'};
 const confirmed=await validateConfirmedTransaction(client,txHash,expected);
 const evidence=purchaseEvidence(confirmed.receipt,exchange,exchangeArtifact.abi,authorization);
 const after=await tradingChain.snapshot(keys.buyer.address,selected.intent.token);
 assert.equal(BigInt(after.tokenBalance)-BigInt(before.tokenBalance),2n*10n**18n);
 assert.equal(BigInt(before.budgetWei)-BigInt(after.budgetWei),200_000_000_000_000n);
 assert.equal(await tradingChain.read('merchantProceeds'),200_000_000_000_000n);
 audit.append({...auditBase,type:'TRANSACTION_CONFIRMED',transactionHash:txHash,blockHash:evidence.blockHash,result:evidence});
 audit.append({...auditBase,type:'TOKEN_BALANCE_CHANGED',transactionHash:txHash,result:{before,after}});
 const storedEvidence=await store.saveEvidence(evidence);await store.audit(authenticated.traceId,'TRANSACTION_CONFIRMED',{input:{actionHash:actionHash(selected.intent),policyHash:policy.policyHash},output:evidence,references:[storedEvidence]});
 assert.equal((await store.trace(authenticated.traceId))!.integrity,true);assert.equal(verifyTradeAuditChain(audit.events),true);
 const submissionsBefore=await client.getTransactionCount({address:keys.executor.address});
 await assert.rejects(()=>client.simulateContract({address:exchange,abi:exchangeArtifact.abi,functionName:'buyWithAuthorization',args:[authorization,signature,'0x'],account:keys.executor.address}));
 await assert.rejects(()=>validateConfirmedTransaction(client,txHash,{...expected,to:registry}),/TARGET_MISMATCH/);
 await assert.rejects(()=>validateConfirmedTransaction({...client,getChainId:async()=>1},txHash,expected),/RPC_CHAIN_MISMATCH/);
 const rejectIntent={...selected.intent,nonce:randomHex(16)};
 const rejected=await authenticate(rejectIntent,p=>{p.claimedIdentity={...p.claimedIdentity,agentId:'8'};});assert.equal(rejected.verdict,'REJECT');
 flags.cardUnavailable=true;const partial=await authenticate({...selected.intent,nonce:randomHex(16)});flags.cardUnavailable=false;assert.equal(partial.verdict,'PARTIAL');
 for(const verdict of ['REJECT','PARTIAL'] as const){const denied=await rules.authorize({...input,authentication:{...authentication,verdict}});assert.equal(denied.verdict,'DENY');await assert.rejects(()=>signExecutionAuthorization(keys.verifier,{chainId:31337,exchange,authorization,authentication:{...authentication,verdict},decision:denied,intent:selected.intent,claimNonce:()=>{throw new Error('SHOULD_NOT_CLAIM');},now}),/AUTHENTICATION_NOT_VERIFIED/);}
 const paused={...policy,active:false};paused.policyHash=policyHash(paused);assert.equal((await rules.authorize({...input,policy:paused})).verdict,'DENY');
 assert.equal(await client.getTransactionCount({address:keys.executor.address}),submissionsBefore,'Denied flows must submit no transaction');
 // A second real purchase exercises exact-action buyer EIP-712 approval at both rule and contract layers.
 await write('buyer',exchange,exchangeArtifact.abi,'configurePolicy',[7n,keys.executor.address,true,200_000_000_000_000n,1n,1_000_000_000_000_000n,BigInt(now/1000+3600)]);
 const askingPolicy={...policy,policyVersion:String(BigInt(policy.policyVersion)+1n),autoApproveLimitWei:'1',spentWei:'200000000000000'};askingPolicy.policyHash=policyHash(askingPolicy);
 const askingIntent={...selected.intent,nonce:randomHex(16)},askingAuth=await authenticate(askingIntent);assert.equal(askingAuth.verdict,'VERIFIED');
 const askingAuthentication:AuthenticationState={verdict:'VERIFIED',expiresAt:askingAuth.ticketExpiresAt!,evidenceHash:askingAuth.evidenceBundleHash};
 const askingInput={...input,intent:askingIntent,policy:askingPolicy,authentication:askingAuthentication,depositedBudgetWei:after.budgetWei};
 assert.equal((await rules.authorize(askingInput)).verdict,'ASK');
 const humanAuthorization=buildExecutionAuthorization({intent:askingIntent,agentOwner:keys.agentOwner.address,policyVersion:askingPolicy.policyVersion,evidenceHash:askingAuth.evidenceBundleHash,traceId:askingAuth.traceId,authenticationExpiresAt:askingAuthentication.expiresAt,now});
 const humanSignature=await keys.buyer.signTypedData(humanApprovalTypedData(31337,exchange,humanAuthorization));
 const humanDecision=await rules.authorize({...askingInput,humanApproval:{authorization:humanAuthorization,signature:humanSignature}});assert.equal(humanDecision.verdict,'ALLOW');
 const humanVerifierSignature=await signExecutionAuthorization(keys.verifier,{chainId:31337,exchange,authorization:humanAuthorization,authentication:askingAuthentication,decision:humanDecision,intent:askingIntent,claimNonce:nonce=>nonceStore.claim(nonce),now});
 const humanReceipt=await write('executor',exchange,exchangeArtifact.abi,'buyWithAuthorization',[humanAuthorization,humanVerifierSignature,humanSignature]);
 assert.equal(await client.readContract({address:selected.intent.token,abi:v.erc20Abi,functionName:'balanceOf',args:[keys.buyer.address]}),4n*10n**18n);
 const summary={network:'ANVIL ONLY',chainId:31337,identityRegistry:'Local test fixture; not official ERC-8004 deployment',authentication:authenticated.verdict,modules:authenticated.modules.map(m=>({module:m.moduleId,status:m.status})),authorization:decision.verdict,exchange,selectedToken:'dNOVA',quantity:'2',before,after,transaction:evidence,humanApprovalTransaction:humanReceipt.transactionHash,replayBlocked:true,deniedTransactionsSubmitted:0,auditIntegrity:true,crossLanguageTypedData:true};
 if(serviceHook)(summary as any).serviceIntegration=await serviceHook({state,rpcUrl,chain,client,keys,wallets,registry,exchange,tokens,documents,issuer,store,verifier,tradingChain,artifact,write});
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/trade-anvil.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
} finally {
 await store?.close();processAnvil.kill('SIGTERM');await new Promise<void>(resolveExit=>{if(processAnvil.exitCode!==null)return resolveExit();processAnvil.once('exit',()=>resolveExit());setTimeout(resolveExit,2000).unref();});rmSync(state,{recursive:true,force:true});
}

}
if(import.meta.url===new URL(process.argv[1],'file://').href)await runAnvilE2E();
