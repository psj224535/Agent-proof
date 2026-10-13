import * as http from 'node:http';
import * as https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {sha256} from '../crypto/index.ts';
import {parseJsonStrict} from '../shared-schemas/json.ts';
import {VerificationFailure,SourceUnavailable} from '../verification-core/errors.ts';
export interface FetchResult {value:unknown;sourceUrl:string;sourceHash:string;fetchedAt:string}
export interface Fetcher {json(url:string,signal?:AbortSignal):Promise<FetchResult>}
export function isGlobalAddress(address:string):boolean {
 const family=isIP(address);
 if(family===4){const b=address.split('.').map(Number);const n=((b[0]<<24)|(b[1]<<16)|(b[2]<<8)|b[3])>>>0;
  const denied:[number,number][]=[[0x00000000,8],[0x0a000000,8],[0x64400000,10],[0x7f000000,8],[0xa9fe0000,16],[0xac100000,12],[0xc0000000,24],[0xc0000200,24],[0xc0586300,24],[0xc0a80000,16],[0xc6120000,15],[0xc6336400,24],[0xcb007100,24],[0xe0000000,4],[0xf0000000,4]];
  return !denied.some(([base,bits])=>{const mask=(0xffffffff<<(32-bits))>>>0;return (n&mask)===(base&mask);});
 }
 if(family===6){const a=address.toLowerCase();const first=parseInt(a.split(':')[0]||'0',16);
  return first>=0x2000&&first<=0x3fff&&!a.startsWith('2001:db8:')&&!a.startsWith('2001:0:')&&!a.startsWith('2001::')&&!a.startsWith('2002:')&&!a.startsWith('3fff:');
 } return false;
}
export class SafeFetcher implements Fetcher {
 development:boolean;allowedDevelopmentOrigins:Set<string>;timeoutMs:number;maxBytes:number;ipfsGateway:string|undefined;
 constructor(options:{development?:boolean;allowedDevelopmentOrigins?:string[];timeoutMs?:number;maxBytes?:number;ipfsGateway?:string}={}){
  this.development=options.development??false;this.allowedDevelopmentOrigins=new Set(options.allowedDevelopmentOrigins??[]);this.timeoutMs=options.timeoutMs??3000;this.maxBytes=options.maxBytes??131072;this.ipfsGateway=options.ipfsGateway;
 }
 async json(input:string,parent?:AbortSignal):Promise<FetchResult>{
  const signal=parent?AbortSignal.any([parent,AbortSignal.timeout(this.timeoutMs)]):AbortSignal.timeout(this.timeoutMs);
  let url:URL;try{url=new URL(input);}catch{throw new VerificationFailure('UNSAFE_URI');}
  if(url.protocol==='ipfs:'){
   if(!this.ipfsGateway||!/^ipfs:\/\/[A-Za-z0-9]+(?:\/[A-Za-z0-9._~/-]*)?$/.test(input))throw new VerificationFailure('IPFS_GATEWAY_NOT_ALLOWED');
   url=new URL('/ipfs/'+input.slice(7),this.ipfsGateway);
  }
  if(url.username||url.password||url.hash)throw new VerificationFailure('SSRF_URI_CREDENTIALS_OR_FRAGMENT');
  const dev=this.development&&this.allowedDevelopmentOrigins.has(url.origin);
  if(!dev&&(url.protocol!=='https:'||(url.port&&url.port!=='443')))throw new VerificationFailure('SSRF_SCHEME_OR_PORT');
  if(dev&&!['http:','https:'].includes(url.protocol))throw new VerificationFailure('SSRF_SCHEME_OR_PORT');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  let addresses:{address:string;family:number}[];
  try{addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await lookup(hostname,{all:true,verbatim:true});}
  catch{throw new SourceUnavailable('DNS_LOOKUP_FAILED');}
  if(signal.aborted)throw new SourceUnavailable('SOURCE_TIMEOUT');
  if(!addresses.length||(!dev&&addresses.some(a=>!isGlobalAddress(a.address))))throw new VerificationFailure('SSRF_PRIVATE_OR_RESERVED_ADDRESS');
  const selected=addresses[0];
  const bytes=await new Promise<Buffer>((resolve,reject)=>{
   const request=(url.protocol==='https:'?https:http).request(url,{
    method:'GET',agent:false,signal,headers:{accept:'application/json','accept-encoding':'identity'},
    // Pin the checked address: no second DNS lookup at connection time.
    lookup:((_host:unknown,options:unknown,cb:Function)=>{
     if(options&&typeof options==='object'&&(options as {all?:boolean}).all)cb(null,[selected]);else cb(null,selected.address,selected.family);
    }) as any
   },res=>{
    if((res.statusCode??0)>=300&&(res.statusCode??0)<400){res.resume();reject(new VerificationFailure('SSRF_REDIRECT_BLOCKED'));return;}
    if(res.statusCode!==200){res.resume();reject(new SourceUnavailable('SOURCE_HTTP_'+res.statusCode));return;}
    if(!/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(res.headers['content-type']??'')){res.resume();reject(new VerificationFailure('SOURCE_NOT_JSON'));return;}
    if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.resume();reject(new VerificationFailure('COMPRESSED_SOURCE_UNSUPPORTED'));return;}
    if(Number(res.headers['content-length']??0)>this.maxBytes){res.resume();reject(new VerificationFailure('SOURCE_TOO_LARGE'));return;}
    const chunks:Buffer[]=[];let total=0;
    res.on('data',(b:Buffer)=>{total+=b.length;if(total>this.maxBytes){request.destroy();reject(new VerificationFailure('SOURCE_TOO_LARGE'));}else chunks.push(b);});
    res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',()=>reject(new SourceUnavailable('SOURCE_STREAM_FAILED')));
   });request.on('error',()=>reject(new SourceUnavailable(signal.aborted?'SOURCE_TIMEOUT':'SOURCE_NETWORK_ERROR')));request.end();
  });
  let value:unknown;try{value=parseJsonStrict(bytes);}catch{throw new VerificationFailure('SOURCE_INVALID_JSON');}
  return {value,sourceUrl:url.toString(),sourceHash:sha256(bytes),fetchedAt:new Date().toISOString()};
 }
}
