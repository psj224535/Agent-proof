import {appendFileSync,existsSync,mkdirSync,readFileSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {hash,canonical,without} from '../crypto/index.ts';
import {parseJsonStrict} from '../shared-schemas/json.ts';

export const TRADE_AUDIT_TYPES=['TRADE_INTENT_CREATED','AUTHENTICATION_STARTED','AUTHENTICATION_MODULE_RESULT','AUTHENTICATION_COMPLETED','AUTHORIZATION_EVALUATED','HUMAN_APPROVAL_REQUESTED','HUMAN_APPROVAL_CONFIRMED','EXECUTION_AUTHORIZATION_ISSUED','TRANSACTION_SUBMITTED','TRANSACTION_CONFIRMED','TOKEN_BALANCE_CHANGED','EXECUTION_FAILED'] as const;
export interface TradeAuditEvent {
  traceId:string;type:typeof TRADE_AUDIT_TYPES[number];parentEvent:string|null;
  requestHash:string|null;policyHash:string|null;evidenceHash:string|null;transactionHash:string|null;blockHash:string|null;
  result:unknown;reasonCodes:string[];timestamp:string;previousEventHash:string;currentEventHash:string;
}
export type TradeAuditInput=Pick<TradeAuditEvent,'traceId'|'type'> & Partial<Pick<TradeAuditEvent,'requestHash'|'policyHash'|'evidenceHash'|'transactionHash'|'blockHash'|'result'|'reasonCodes'|'timestamp'>>;
function rejectSecrets(value:unknown):void {
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
    if(/^(signature|privatekey|privatekeypem|seedphrase|admintoken|authenticationticket|ticket|authorization)$/i.test(key.replace(/[_-]/g,'')))throw new Error('SECRET_FIELD_NOT_ALLOWED_IN_AUDIT');
    rejectSecrets(child);
  }
}
export function buildTradeAuditEvent(input:TradeAuditInput,previousEventHash='0'.repeat(64),parentEvent:string|null=null):TradeAuditEvent {
  if(typeof input.traceId!=='string'||!input.traceId||input.traceId.length>256||!TRADE_AUDIT_TYPES.includes(input.type))throw new Error('AUDIT_INPUT_INVALID');
  rejectSecrets(input.result);
  const event={traceId:input.traceId,type:input.type,parentEvent,requestHash:input.requestHash??null,policyHash:input.policyHash??null,evidenceHash:input.evidenceHash??null,transactionHash:input.transactionHash??null,blockHash:input.blockHash??null,result:input.result??null,reasonCodes:input.reasonCodes??[],timestamp:input.timestamp??new Date().toISOString(),previousEventHash};
  return {...event,currentEventHash:hash(event)};
}
export function verifyTradeAuditChain(events:TradeAuditEvent[]):boolean {
  let previous='0'.repeat(64);const parents=new Map<string,string>();
  try{for(const event of events){if(event.previousEventHash!==previous||event.parentEvent!==(parents.get(event.traceId)??null)||hash(without(event,'currentEventHash'))!==event.currentEventHash)return false;previous=event.currentEventHash;parents.set(event.traceId,event.currentEventHash);}return true;}catch{return false;}
}
/** Single service writer; audit details contain hashes/public evidence, never credentials. */
export class TradeAuditLog {
  file:string;events:TradeAuditEvent[];
  constructor(file:string){this.file=file;mkdirSync(dirname(file),{recursive:true,mode:0o700});this.events=existsSync(file)?readFileSync(file,'utf8').split('\n').filter(Boolean).map(l=>parseJsonStrict(l) as TradeAuditEvent):[];if(!verifyTradeAuditChain(this.events))throw new Error('TRADE_AUDIT_CHAIN_INVALID');}
  append(input:TradeAuditInput):TradeAuditEvent {
    const parent=this.events.findLast(e=>e.traceId===input.traceId)?.currentEventHash??null;
    const event=buildTradeAuditEvent(input,this.events.at(-1)?.currentEventHash,parent);
    appendFileSync(this.file,canonical(event)+'\n',{mode:0o600});chmodSync(this.file,0o600);this.events.push(event);return event;
  }
  trace(traceId:string):TradeAuditEvent[]{return this.events.filter(e=>e.traceId===traceId).map(e=>structuredClone(e));}
}
