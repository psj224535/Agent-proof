import {createServer} from 'node:http';import type {IncomingMessage,ServerResponse,Server} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync,existsSync,chmodSync} from 'node:fs';import {join,dirname} from 'node:path';
import {keyPair,randomHex,constantEqual} from '../../packages/crypto/index.ts';import type {KeyPair} from '../../packages/crypto/index.ts';
import {parseJsonStrict,validate,obj,S} from '../../packages/shared-schemas/index.ts';
import {ValidationError} from '../../packages/shared-schemas/json.ts';
import {VerificationFailure,SourceUnavailable,ensure} from '../../packages/verification-core/errors.ts';
import type {Transport} from '../../packages/shared-schemas/types.ts';
export interface Request {req:IncomingMessage;res:ServerResponse;method:string;path:string;rawBody:Buffer;json:unknown;headers:Record<string,string>;transport:Transport}
export function stateDir(role:string):string{const d=process.env.ROLE_STATE_DIR??join(process.env.STATE_DIR??'.state',role);mkdirSync(d,{recursive:true,mode:0o700});return d;}
export function secret(path:string):string{if(!existsSync(path)){mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,randomHex(32),{mode:0o600,flag:'wx'});}chmodSync(path,0o600);return readFileSync(path,'utf8').trim();}
export function loadKey(path:string):KeyPair{if(!existsSync(path)){mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,JSON.stringify(keyPair()),{mode:0o600,flag:'wx'});}chmodSync(path,0o600);return JSON.parse(readFileSync(path,'utf8'));}
export function saveJson(path:string,value:unknown):void{writeFileSync(path,JSON.stringify(value,null,2),{mode:0o600});}
export function reply(res:ServerResponse,status:number,value:unknown):void{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));}
export function admin(r:Request,token:string):void{ensure(constantEqual(r.headers.authorization??'','Bearer '+token),'ADMIN_AUTH_REQUIRED');}
export function staticFile(r:Request,app:string):boolean{
 const files:Record<string,[string,string]>={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
 const spec=files[r.path];if(r.method!=='GET'||!spec)return false;
 r.res.writeHead(200,{'content-type':spec[1],'cache-control':'no-store'});r.res.end(readFileSync(new URL('../../apps/'+app+'/'+spec[0],import.meta.url)));return true;
}
export async function serve(port:number,handler:(r:Request)=>Promise<void>,host=process.env.HOST??'127.0.0.1'):Promise<Server>{
 const rates=new Map<string,{since:number;count:number}>();let active=0;
 const server=createServer(async(req,res)=>{
  res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-frame-options','DENY');
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  let counted=false;
  try{
   const key=req.socket.remoteAddress??'unknown';const now=Date.now();if(rates.size>2000)for(const[k,v]of rates)if(v.since+60000<now)rates.delete(k);
   let rate=rates.get(key);if(!rate||now-rate.since>=60000){rate={since:now,count:0};rates.set(key,rate);}if(++rate.count>600){reply(res,429,{error:'RATE_LIMIT'});return;}
   if(active>=24){reply(res,503,{error:'SERVER_BUSY'});return;}active++;counted=true;
   const headers:Record<string,string>={};const rejectDup=new Set(['host','signature','signature-input','content-digest','authorization','content-type','origin']);
   for(let i=0;i<req.rawHeaders.length;i+=2){const k=req.rawHeaders[i].toLowerCase();if(rejectDup.has(k)&&headers[k]!==undefined)throw new VerificationFailure('DUPLICATE_HEADER');headers[k]=req.rawHeaders[i+1];}
   const authority=headers.host??'';
   const hosts=(process.env.ALLOWED_HOSTS??`127.0.0.1:${port},localhost:${port}`).split(',');ensure(hosts.includes(authority),'HOST_NOT_ALLOWED');
   if(headers.origin)ensure(headers.origin==='http://'+authority||headers.origin==='https://'+authority,'CROSS_ORIGIN_REQUEST_BLOCKED');
   const method=req.method??'GET';const rawPath=req.url??'/';ensure(rawPath.startsWith('/')&&!rawPath.startsWith('//'),'INVALID_REQUEST_TARGET');
   const path=new URL(rawPath,'http://'+authority).pathname;
   if(rawPath.includes('?')&&(path==='/api/v1/authenticate'||path==='/api/v1/protected/mock-purchase'))throw new VerificationFailure('QUERY_NOT_SUPPORTED_IN_SIGNED_PROFILE');
   let size=0;const chunks:Buffer[]=[];
   if(['POST','PATCH','PUT'].includes(method)){
    ensure(/^application\/json(?:;|$)/i.test(headers['content-type']??''),'JSON_CONTENT_TYPE_REQUIRED');ensure(!headers['content-encoding'],'CONTENT_ENCODING_UNSUPPORTED');
    if(Number(req.headers['content-length']??0)>131072){reply(res,413,{error:'BODY_TOO_LARGE'});req.resume();return;}
    for await(const b of req){size+=b.length;if(size>131072){reply(res,413,{error:'BODY_TOO_LARGE'});req.destroy();return;}chunks.push(b);}
   }
   const rawBody=Buffer.concat(chunks);let json:unknown={};if(rawBody.length){try{json=parseJsonStrict(rawBody);}catch{throw new VerificationFailure('INVALID_JSON');}}
   await handler({req,res,method,path,rawBody,json,headers,transport:{method,path,authority,rawBody,headers:Object.fromEntries(['signature','signature-input','content-digest','content-type','authorization'].filter(k=>headers[k]!==undefined).map(k=>[k,headers[k]]))}});
   if(!res.writableEnded)reply(res,404,{error:'NOT_FOUND'});
  }catch(e){if(!res.headersSent){const code=e instanceof VerificationFailure?e.code:e instanceof ValidationError?'SCHEMA_INVALID':e instanceof SourceUnavailable?'SOURCE_UNAVAILABLE':'INTERNAL_SAFE_FAILURE';const status=code==='ADMIN_AUTH_REQUIRED'?401:e instanceof SourceUnavailable?503:e instanceof VerificationFailure||e instanceof ValidationError?400:500;reply(res,status,{error:code});}}
  finally{if(counted)active=Math.max(0,active-1);}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=2000;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});});return server;
}
export async function jsonRequest(origin:string,path:string,body?:unknown,headers:Record<string,string>={}):Promise<any>{
 const r=await fetch(new URL(path,origin),{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
 const j=parseJsonStrict(Buffer.from(await r.arrayBuffer()));if(!r.ok)throw new Error((j as any).error??'HTTP_'+r.status);return j;
}
