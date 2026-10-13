import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join} from 'node:path';
const agent=process.env.AGENT_ORIGIN??'http://127.0.0.1:3000',verifier=process.env.VERIFIER_ORIGIN??'http://127.0.0.1:3001';
const token=readFileSync(join(process.env.STATE_DIR??'.state','verifier','admin-token'),'utf8').trim();
async function call(origin:string,path:string,method='GET',body?:unknown,admin=false){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json() as any;return {status:r.status,j};}
const scenarios=(await call(agent,'/api/public/config')).j.scenarios;let count=0;
for(const[id]of scenarios){const r=await call(agent,'/api/scenarios/'+id+'/run','POST',{});assert.equal(r.status,200,JSON.stringify(r.j));assert.equal(r.j.result.verdict,id==='normal'?'VERIFIED':'REJECT',id+': '+JSON.stringify(r.j.result.reasonCodes));assert.equal(r.j.result.assuranceProfile,'DEVELOPMENT_MINIMAL');if(id==='normal'){assert.equal(r.j.protectedResult.paymentExecuted,false);assert.equal(r.j.protectedResult.authenticated,true);}const t=await call(verifier,'/api/v1/traces/'+r.j.result.traceId,'GET',undefined,true);assert.equal(t.j.integrity,true);console.log('PASS '+id);count++;}
assert.equal((await call(verifier,'/api/v1/modules')).status,401);count++;
let config=(await call(verifier,'/api/v1/modules','GET',undefined,true)).j.configuration;
let r=await call(verifier,'/api/v1/modules/aps-passport','PATCH',{expectedVersion:config.version,enabled:false},true);assert.equal(r.j.policyProfile,'WEB3_AGENT_V1');
const reduced=await call(agent,'/api/scenarios/normal/run','POST',{});assert.equal(reduced.j.result.verdict,'VERIFIED');assert.equal(reduced.j.result.policyProfile,'WEB3_AGENT_V1');assert.equal(reduced.j.result.modules[2].status,'SKIP');count++;
config=r.j.configuration;
r=await call(verifier,'/api/v1/modules/aps-passport','PATCH',{expectedVersion:config.version,enabled:true},true);assert.equal(r.j.policyProfile,'FULL_AUTH_V1');count++;
config=r.j.configuration;
const stale=await call(verifier,'/api/v1/modules/aps-passport','PATCH',{expectedVersion:config.version-1,enabled:false},true);assert.equal(stale.status,400);count++;
const cross=await fetch(verifier+'/api/v1/modules/aps-passport',{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer '+token,origin:'http://attacker.example'},body:JSON.stringify({expectedVersion:config.version,enabled:false})});assert.equal(cross.status,400);count++;
const dup=await fetch(verifier+'/api/v1/challenges',{method:'POST',headers:{'content-type':'application/json'},body:'{"subjectAgent":1,"subjectAgent":2}'});assert.equal(dup.status,400);count++;
const html=await fetch(agent+'/');assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy')??'',/frame-ancestors 'none'/);count++;
console.log(`HTTP E2E: ${count} checks passed. Real independent local processes; simulated registry and issuer.`);
