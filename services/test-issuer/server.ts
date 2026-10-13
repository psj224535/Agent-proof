import {join} from 'node:path';import {SQLite} from '../../packages/storage/sql.ts';
import {serve,stateDir,loadKey,reply,jsonRequest} from '../common/http.ts';
import {validate,obj,S,bindingSchema,signatureSchema} from '../../packages/shared-schemas/index.ts';
import {hash,verifyObject} from '../../packages/crypto/index.ts';import {ensure} from '../../packages/verification-core/errors.ts';
import {createAttestation,statusDocument,TEST_ISSUER} from '../../packages/agent-kit/index.ts';
export async function startIssuer(){
 ensure(process.env.AGENTPROOF_DEVELOPMENT==='true','TEST_ISSUER_REQUIRES_DEVELOPMENT');
 const dir=stateDir('issuer'),key=loadKey(join(dir,'key.json'));const sql=new SQLite(join(dir,'issuer.sqlite'));await sql.all('CREATE TABLE IF NOT EXISTS attestations(id TEXT PRIMARY KEY,body TEXT NOT NULL,status TEXT NOT NULL,key TEXT NOT NULL)');
 const origin=process.env.ISSUER_ORIGIN??'http://127.0.0.1:3003';const registry=process.env.REGISTRY_ORIGIN??'http://127.0.0.1:3002';
 const server=await serve(Number(process.env.ISSUER_PORT??3003),async r=>{
  if(r.method==='GET'&&r.path==='/health'){reply(r.res,200,{ok:true,testIssuer:true});return;}
  if(r.method==='GET'&&r.path==='/public-key'){reply(r.res,200,{issuer:TEST_ISSUER,publicKeyMultibase:key.publicKeyMultibase,testIssuer:true});return;}
  if(r.method==='POST'&&r.path==='/attest'){
   const v=validate<any>(obj({binding:bindingSchema,signature:signatureSchema}),r.json);const b=v.binding;
   ensure(verifyObject(b.publicKeyMultibase,'AGENTPROOF-TEST-ATTEST-REQUEST-V1',b,v.signature),'ISSUER_REQUEST_SIGNATURE_INVALID');
   const s=await jsonRequest(registry,'/agents/'+b.subjectAgent.agentId);ensure(s&&s.runtimeBindingHash===hash(b)&&s.owner===b.ownerWallet,'ISSUER_CURRENT_BINDING_MISMATCH');
   const a=createAttestation({identity:b.subjectAgent,binding:b} as any,key,origin);
   await sql.all('INSERT INTO attestations(id,body,status,key) VALUES(?,?,?,?)',[a.attestationId,JSON.stringify(a),'ACTIVE',b.publicKeyMultibase]);reply(r.res,200,a);return;
  }
  const m=/^\/status\/([a-z0-9-]{36})$/.exec(r.path);
  if(r.method==='GET'&&m){const row=(await sql.all('SELECT body,status FROM attestations WHERE id=?',[m[1]]))[0];ensure(row,'ATTESTATION_UNKNOWN');reply(r.res,200,statusDocument(JSON.parse(String(row.body)),key,String(row.status)));return;}
  if(r.method==='POST'&&r.path==='/revoke'){
   const v=validate<any>(obj({attestationId:S,signature:signatureSchema}),r.json);const row=(await sql.all('SELECT key FROM attestations WHERE id=?',[v.attestationId]))[0];ensure(row&&verifyObject(String(row.key),'AGENTPROOF-TEST-REVOKE-V1',{attestationId:v.attestationId},v.signature),'REVOCATION_SIGNATURE_INVALID');
   await sql.all("UPDATE attestations SET status='REVOKED' WHERE id=?",[v.attestationId]);reply(r.res,200,{revoked:true,testIssuer:true});return;
  }
 });return {server,close:async()=>{server.close();await sql.close();}};
}
if(import.meta.url===new URL(process.argv[1],'file://').href)await startIssuer();
