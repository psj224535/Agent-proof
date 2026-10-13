import {randomUUID} from 'node:crypto';
import {hash,without,iso} from '../crypto/index.ts';
import type {Sql} from './sql.ts';
import type {Challenge,Configuration,AuditEvent,AuthenticationResult,Identity,ModuleId,JsonObject} from '../shared-schemas/types.ts';
import {defaultConfiguration} from '../verification-core/config.ts';
import {VerificationFailure,ensure} from '../verification-core/errors.ts';
export class Store {
 sql:Sql;constructor(sql:Sql){this.sql=sql;}
 async init(initial=defaultConfiguration()):Promise<void>{
  const commands=[
   'CREATE TABLE IF NOT EXISTS configuration (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, body TEXT NOT NULL)',
   'CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, body TEXT NOT NULL, expires_at BIGINT NOT NULL, consumed_at BIGINT)',
   'CREATE TABLE IF NOT EXISTS nonces (scope TEXT NOT NULL, nonce TEXT NOT NULL, expires_at BIGINT NOT NULL, PRIMARY KEY(scope,nonce))',
   'CREATE TABLE IF NOT EXISTS requests (scope TEXT NOT NULL, request_id TEXT NOT NULL, trace_id TEXT NOT NULL, PRIMARY KEY(scope,request_id))',
   'CREATE TABLE IF NOT EXISTS tickets (jti TEXT PRIMARY KEY, token_hash TEXT NOT NULL, trace_id TEXT NOT NULL, expires_at BIGINT NOT NULL, consumed_at BIGINT)',
   'CREATE TABLE IF NOT EXISTS traces (id TEXT PRIMARY KEY, agent_key TEXT NOT NULL, created_at BIGINT NOT NULL, last_hash TEXT NOT NULL, last_event_id TEXT, result TEXT)',
   'CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id), sequence INTEGER NOT NULL, body TEXT NOT NULL, UNIQUE(trace_id,sequence))',
   'CREATE TABLE IF NOT EXISTS evidence (hash TEXT PRIMARY KEY, body TEXT NOT NULL)',
   'CREATE INDEX IF NOT EXISTS trace_created_index ON traces(created_at)',
   'CREATE INDEX IF NOT EXISTS audit_trace_index ON audit_events(trace_id,sequence)'
  ];for(const s of commands)await this.sql.all(s);
  await this.sql.all('INSERT INTO configuration(id,version,body) VALUES(1,?,?) ON CONFLICT(id) DO NOTHING',[initial.version,JSON.stringify(initial)]);
 }
 async configuration():Promise<Configuration>{return JSON.parse(String((await this.sql.all('SELECT body FROM configuration WHERE id=1'))[0].body));}
 async changeConfiguration(expectedVersion:number,edit:(c:Configuration)=>void):Promise<Configuration>{return this.sql.transaction(async tx=>{
  const lock=tx.dialect==='postgres'?' FOR UPDATE':'';
  const c=JSON.parse(String((await tx.all('SELECT body FROM configuration WHERE id=1'+lock))[0].body)) as Configuration;
  ensure(c.version===expectedVersion,'CONFIGURATION_CONFLICT');edit(c);c.version++;
  await tx.all('UPDATE configuration SET version=?,body=? WHERE id=1',[c.version,JSON.stringify(c)]);return c;
 });}
 async newTrace(identity:Identity,now:number):Promise<string>{const id=randomUUID();await this.sql.all('INSERT INTO traces(id,agent_key,created_at,last_hash) VALUES(?,?,?,?)',[id,hash(identity),now,'0'.repeat(64)]);return id;}
 async saveEvidence(value:unknown):Promise<string>{const h=hash(value);await this.sql.all('INSERT INTO evidence(hash,body) VALUES(?,?) ON CONFLICT(hash) DO NOTHING',[h,JSON.stringify(value)]);return h;}
 async audit(traceId:string,eventType:string,data:{moduleId?:ModuleId;actor?:string;input?:unknown;output?:unknown;reasonCodes?:string[];references?:string[];configuration?:Configuration;now?:number}={}):Promise<AuditEvent>{
  return this.sql.transaction(async tx=>{
   const lock=tx.dialect==='postgres'?' FOR UPDATE':'';
   const t=(await tx.all('SELECT last_hash,last_event_id FROM traces WHERE id=?'+lock,[traceId]))[0];if(!t)throw new Error('UNKNOWN_TRACE');
   const n=Number((await tx.all('SELECT COUNT(*) AS n FROM audit_events WHERE trace_id=?',[traceId]))[0].n);
   const e:Omit<AuditEvent,'eventHash'>={eventId:randomUUID(),traceId,parentEventId:(t.last_event_id as string)||null,eventType,moduleId:data.moduleId??null,actor:data.actor??'verifier-service',timestamp:iso(data.now??Date.now()),inputHash:hash(data.input??null),outputHash:hash(data.output??null),previousEventHash:String(t.last_hash),reasonCodes:data.reasonCodes??[],evidenceReferences:data.references??[],configurationSnapshot:data.configuration??null};
   const full={...e,eventHash:hash(e)};
   await tx.all('INSERT INTO audit_events(id,trace_id,sequence,body) VALUES(?,?,?,?)',[e.eventId,traceId,n,JSON.stringify(full)]);
   await tx.all('UPDATE traces SET last_hash=?,last_event_id=? WHERE id=?',[full.eventHash,e.eventId,traceId]);return full;
  });
 }
 async saveResult(result:AuthenticationResult):Promise<void>{await this.sql.all('UPDATE traces SET result=? WHERE id=?',[JSON.stringify(without(result,'ticket')),result.traceId]);}
 async traces(limit=50):Promise<unknown[]>{return (await this.sql.all('SELECT id,created_at,result FROM traces ORDER BY created_at DESC LIMIT ?',[Math.min(100,Math.max(1,limit))])).map(r=>({traceId:r.id,createdAt:iso(Number(r.created_at)),result:r.result?JSON.parse(String(r.result)):null}));}
 async trace(id:string):Promise<{traceId:string;result:AuthenticationResult|null;events:AuditEvent[];integrity:boolean}|null>{
  const r=(await this.sql.all('SELECT * FROM traces WHERE id=?',[id]))[0];if(!r)return null;
  const events=(await this.sql.all('SELECT body FROM audit_events WHERE trace_id=? ORDER BY sequence',[id])).map(r=>JSON.parse(String(r.body)) as AuditEvent);
  let prev='0'.repeat(64),parent:string|null=null,integrity=true;
  for(const e of events){if(e.previousEventHash!==prev||e.parentEventId!==parent||e.eventHash!==hash(without(e,'eventHash')))integrity=false;prev=e.eventHash;parent=e.eventId;
   for(const h of e.evidenceReferences){const v=await this.evidence(h);if(v===null||hash(v)!==h)integrity=false;}}
  if(prev!==r.last_hash)integrity=false;
  return {traceId:id,result:r.result?JSON.parse(String(r.result)):null,events,integrity};
 }
 async evidence(h:string):Promise<unknown|null>{const r=(await this.sql.all('SELECT body FROM evidence WHERE hash=?',[h]))[0];return r?JSON.parse(String(r.body)):null;}
 async challenge(c:Challenge):Promise<void>{await this.sql.all('INSERT INTO challenges(id,body,expires_at) VALUES(?,?,?)',[c.challengeId,JSON.stringify(c),Date.parse(c.expiresAt)]);}
 async getChallenge(id:string):Promise<{challenge:Challenge;consumedAt:number|null}|null>{const r=(await this.sql.all('SELECT body,consumed_at FROM challenges WHERE id=?',[id]))[0];return r?{challenge:JSON.parse(String(r.body)),consumedAt:r.consumed_at===null?null:Number(r.consumed_at)}:null;}
 async hasNonce(scope:string,nonce:string):Promise<boolean>{return (await this.sql.all('SELECT nonce FROM nonces WHERE scope=? AND nonce=?',[scope,nonce])).length>0;}
 async commitAuthentication(input:{scope:string;nonce:string;requestId:string;traceId:string;expiresAt:number;now:number;challengeId?:string;ticket:{jti:string;hash:string;expiresAt:number}}):Promise<void>{
  await this.sql.transaction(async tx=>{
   const n=await tx.all('INSERT INTO nonces(scope,nonce,expires_at) VALUES(?,?,?) ON CONFLICT(scope,nonce) DO NOTHING RETURNING nonce',[input.scope,input.nonce,input.expiresAt]);ensure(n.length,'NONCE_REPLAY');
   const r=await tx.all('INSERT INTO requests(scope,request_id,trace_id) VALUES(?,?,?) ON CONFLICT(scope,request_id) DO NOTHING RETURNING request_id',[input.scope,input.requestId,input.traceId]);ensure(r.length,'REQUEST_REPLAY');
   if(input.challengeId){const c=await tx.all('UPDATE challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>? RETURNING id',[input.now,input.challengeId,input.now]);ensure(c.length,'CHALLENGE_REPLAY_OR_EXPIRED');}
   await tx.all('INSERT INTO tickets(jti,token_hash,trace_id,expires_at) VALUES(?,?,?,?)',[input.ticket.jti,input.ticket.hash,input.traceId,input.ticket.expiresAt]);
  });
 }
 async consumeTicket(jti:string,tokenHash:string,now:number):Promise<void>{
  const r=await this.sql.all('UPDATE tickets SET consumed_at=? WHERE jti=? AND token_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING jti',[now,jti,tokenHash,now]);ensure(r.length,'TICKET_REPLAY_OR_EXPIRED');
 }
 async close():Promise<void>{await this.sql.close();}
}
