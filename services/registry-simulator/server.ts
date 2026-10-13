import {join} from 'node:path';import {SQLite} from '../../packages/storage/sql.ts';
import {serve,stateDir,reply} from '../common/http.ts';
import {validate,obj,S,hashSchema,signatureSchema} from '../../packages/shared-schemas/index.ts';
import {hash,verifyObject,inTime} from '../../packages/crypto/index.ts';import {ensure} from '../../packages/verification-core/errors.ts';
import type {RegistrySnapshot} from '../../packages/shared-schemas/types.ts';
export async function startRegistry(){
 ensure(process.env.AGENTPROOF_DEVELOPMENT==='true','SIMULATION_REQUIRES_EXPLICIT_DEVELOPMENT');
 const sql=new SQLite(join(stateDir('registry'),'registry.sqlite'));await sql.all('CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,owner_key TEXT NOT NULL,snapshot TEXT NOT NULL)');await sql.all('CREATE TABLE IF NOT EXISTS writes(nonce TEXT PRIMARY KEY)');
 const server=await serve(Number(process.env.REGISTRY_PORT??3002),async r=>{
  if(r.method==='GET'&&r.path==='/health'){reply(r.res,200,{ok:true,simulation:true});return;}
  const m=/^\/agents\/(\d{1,15})$/.exec(r.path);
  if(r.method==='GET'&&m){const row=(await sql.all('SELECT snapshot FROM agents WHERE id=?',[m[1]]))[0];reply(r.res,200,row?JSON.parse(String(row.snapshot)):null);return;}
  if(r.method==='POST'&&r.path==='/register'){
   const v=validate<any>(obj({snapshot:{type:'object'},ownerKey:S,issuedAt:S,expiresAt:S,nonce:hashSchema,signature:signatureSchema}),r.json);
   const body={snapshot:v.snapshot,ownerKey:v.ownerKey,issuedAt:v.issuedAt,expiresAt:v.expiresAt,nonce:v.nonce};
   ensure(inTime(v.issuedAt,v.expiresAt,Date.now())&&Date.parse(v.expiresAt)-Date.parse(v.issuedAt)<=60000,'REGISTRY_WRITE_EXPIRED');
   ensure(verifyObject(v.ownerKey,'AGENTPROOF-SIM-REGISTER-V1',body,v.signature),'REGISTRY_OWNER_SIGNATURE_INVALID');
   const s=v.snapshot as RegistrySnapshot;ensure(s.identity.chainId===31337&&s.identity.registry==='0x0000000000000000000000000000000000008004'&&/^\d{1,15}$/.test(s.identity.agentId),'SIM_REGISTRY_IDENTITY_INVALID');
   ensure(s.owner==='0x'+hash(v.ownerKey).slice(0,40),'SIM_OWNER_ADDRESS_MISMATCH');
   const origin=new URL(s.agentURI).origin;ensure(origin===(process.env.AGENT_ORIGIN??'http://127.0.0.1:3000'),'SIM_AGENT_ORIGIN_NOT_ALLOWED');
   await sql.transaction(async tx=>{const row=(await tx.all('SELECT owner_key,snapshot FROM agents WHERE id=?',[s.identity.agentId]))[0];ensure(!row||row.owner_key===v.ownerKey,'SIM_OWNER_CHANGED');await tx.all('INSERT INTO writes(nonce) VALUES(?)',[v.nonce]);s.source='simulation';s.abiVersion='SIMULATION-NOT-ERC8004-CHAIN';s.blockNumber=String(row?Number(JSON.parse(String(row.snapshot)).blockNumber)+1:1);s.blockHash=hash(s);await tx.all('INSERT INTO agents(id,owner_key,snapshot) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot',[s.identity.agentId,v.ownerKey,JSON.stringify(s)]);});
   reply(r.res,200,{snapshot:s,simulation:true});return;
  }
  if(r.method==='POST'&&r.path==='/transfer'){
   const v=validate<any>(obj({agentId:S,newOwnerKey:S,issuedAt:S,expiresAt:S,nonce:hashSchema,signature:signatureSchema}),r.json);
   const {signature,...body}=v;ensure(inTime(v.issuedAt,v.expiresAt,Date.now()),'TRANSFER_EXPIRED');
   await sql.transaction(async tx=>{const row=(await tx.all('SELECT owner_key,snapshot FROM agents WHERE id=?',[v.agentId]))[0];ensure(row,'AGENT_NOT_REGISTERED');ensure(verifyObject(String(row.owner_key),'AGENTPROOF-SIM-TRANSFER-V1',body,signature),'TRANSFER_SIGNATURE_INVALID');await tx.all('INSERT INTO writes(nonce) VALUES(?)',[v.nonce]);const s=JSON.parse(String(row.snapshot));s.owner='0x'+hash(v.newOwnerKey).slice(0,40);s.agentWallet='0x'+'0'.repeat(40);s.blockNumber=String(Number(s.blockNumber)+1);s.blockHash=hash(s);await tx.all('UPDATE agents SET owner_key=?,snapshot=? WHERE id=?',[v.newOwnerKey,JSON.stringify(s),v.agentId]);});
   reply(r.res,200,{transferred:true,simulation:true});return;
  }
 });return {server,close:async()=>{server.close();await sql.close();}};
}
if(import.meta.url===new URL(process.argv[1],'file://').href)await startRegistry();
