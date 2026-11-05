import {loadViem} from '../erc8004-filter/viem-reader.ts';
import {validate} from '../shared-schemas/json.ts';
import {bytes32Schema,addressSchema,testChainSchema,uint256} from './schema.ts';
import type {ExecutionAuthorization,TestChainId,TransactionEvidence} from './types.ts';

export interface ExpectedTransaction {chainId:TestChainId;from:string;to?:string;data:string;value:string}
const same=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const check=(condition:unknown,code:string)=>{if(!condition)throw new Error(code);};
/** Never accepts a receipt supplied by a browser. Fetch and cross-check from configured RPC. */
export async function validateConfirmedTransaction(client:any,transactionHash:string,expected:ExpectedTransaction,confirmations=1):Promise<{receipt:any;transaction:any;block:any}> {
  validate(bytes32Schema,transactionHash);validate(testChainSchema,expected.chainId);validate(addressSchema,expected.from);
  if(expected.to)validate(addressSchema,expected.to);uint256(expected.value);
  check(/^0x(?:[0-9a-fA-F]{2})*$/.test(expected.data),'TRANSACTION_DATA_INVALID');
  check(Number.isSafeInteger(confirmations)&&confirmations>=1,'CONFIRMATIONS_INVALID');
  check(await client.getChainId()===expected.chainId,'RPC_CHAIN_MISMATCH');
  const receipt=await client.waitForTransactionReceipt({hash:transactionHash,confirmations,timeout:180000});
  check(receipt.status==='success','TRANSACTION_REVERTED');
  check(same(receipt.transactionHash,transactionHash),'RECEIPT_TRANSACTION_MISMATCH');
  const [transaction,block,latest]=await Promise.all([
    client.getTransaction({hash:transactionHash}),client.getBlock({blockNumber:receipt.blockNumber}),client.getBlockNumber()
  ]);
  check(same(transaction.hash,transactionHash),'TRANSACTION_HASH_MISMATCH');
  check(transaction.chainId===expected.chainId,'TRANSACTION_CHAIN_MISMATCH');
  check(same(transaction.from,expected.from),'TRANSACTION_SENDER_MISMATCH');
  check(expected.to?same(transaction.to,expected.to):transaction.to===null,'TRANSACTION_TARGET_MISMATCH');
  check(same(transaction.input,expected.data),'TRANSACTION_CALLDATA_MISMATCH');
  check(transaction.value===BigInt(expected.value),'TRANSACTION_VALUE_MISMATCH');
  check(transaction.blockNumber===receipt.blockNumber&&same(transaction.blockHash,receipt.blockHash),'RECEIPT_BLOCK_MISMATCH');
  check(same(block.hash,receipt.blockHash),'RECEIPT_NONCANONICAL_BLOCK');
  check(BigInt(latest)-BigInt(receipt.blockNumber)+1n>=BigInt(confirmations),'RECEIPT_CONFIRMATIONS_INSUFFICIENT');
  check(Array.isArray(block.transactions)&&block.transactions.some((t:any)=>same(typeof t==='string'?t:t.hash,transactionHash)),'TRANSACTION_NOT_IN_BLOCK');
  check(await client.getChainId()===expected.chainId,'RPC_CHAIN_MISMATCH');
  return {receipt,transaction,block};
}
export function purchaseEvidence(receipt:any,exchange:string,abi:any,authorization:ExecutionAuthorization):TransactionEvidence {
  check(receipt.status==='success','TRANSACTION_REVERTED');
  const logs=receipt.logs.filter((l:any)=>same(l.address,exchange)&&l.removed!==true);
  const events=loadViem().parseEventLogs({abi,logs,eventName:'VerifiedAgentPurchase',strict:true});
  check(events.length===1,'PURCHASE_EVENT_MISSING_OR_AMBIGUOUS');const event=events[0],a=event.args;
  for(const [field,expected] of Object.entries({user:authorization.buyer,agentId:authorization.agentId,executionWallet:authorization.executionWallet,token:authorization.token,quantity:authorization.quantity,authorizationNonce:authorization.nonce,evidenceHash:authorization.evidenceHash,traceId:authorization.traceId})){
    // Contract field names are deliberately pinned; do not match arbitrary lookalike events.
    check(String(a[field]).toLowerCase()===expected.toLowerCase(),'PURCHASE_EVENT_'+field.toUpperCase()+'_MISMATCH');
  }
  check(BigInt(a.totalCostWei)>0n&&BigInt(a.totalCostWei)<=BigInt(authorization.maxTotalCostWei),'PURCHASE_COST_MISMATCH');
  check(same(event.transactionHash,receipt.transactionHash)&&same(event.blockHash,receipt.blockHash),'PURCHASE_LOG_RECEIPT_MISMATCH');
  return {transactionHash:receipt.transactionHash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash,gasUsed:String(receipt.gasUsed),status:'success',eventName:'VerifiedAgentPurchase',event:Object.fromEntries(Object.entries(a).map(([k,v])=>[k,String(v)]))};
}
