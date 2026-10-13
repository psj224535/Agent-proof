import {createHash,generateKeyPairSync,createPrivateKey,createPublicKey,sign,verify,randomBytes,timingSafeEqual} from 'node:crypto';
import type {KeyObject} from 'node:crypto';

/** RFC 8785 on the deliberately restricted, validated I-JSON input domain. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') { if (!value.isWellFormed()) throw new Error('INVALID_UNICODE'); return JSON.stringify(value); }
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('NON_FINITE_NUMBER'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (typeof value === 'object' && value && [Object.prototype,null].includes(Object.getPrototypeOf(value))) {
    return '{'+Object.keys(value).sort().map(k=>canonical(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  }
  throw new Error('NOT_JSON');
}
export function sha256(bytes: string|Uint8Array):string { return createHash('sha256').update(bytes).digest('hex'); }
export function hash(value:unknown):string { return sha256(canonical(value)); }
export function without<T extends object>(value:T,...keys:string[]):Record<string,unknown> {
  return Object.fromEntries(Object.entries(value).filter(([k])=>!keys.includes(k)));
}
export function domainBytes(tag:string,value:unknown):Buffer {return Buffer.concat([Buffer.from(tag+'\0','ascii'),Buffer.from(canonical(value),'utf8')]);}
export function randomHex(size=16):string {return randomBytes(size).toString('hex');}
export function constantEqual(a:string,b:string):boolean {const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58Encode(bytes:Uint8Array):string {
  let n=BigInt('0x'+(Buffer.from(bytes).toString('hex')||'0')),s='';
  while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}
  for (const b of bytes){if(b!==0)break;s='1'+s;} return s;
}
export function base58Decode(text:string):Buffer {
  if(!text || text.length>100)throw new Error('INVALID_BASE58');
  let n=0n;for(const c of text){const i=alphabet.indexOf(c);if(i<0)throw new Error('INVALID_BASE58');n=n*58n+BigInt(i);}
  let h=n.toString(16);if(h.length%2)h='0'+h;
  const body=n===0n?Buffer.alloc(0):Buffer.from(h,'hex');let z=0;while(text[z]==='1')z++;
  return Buffer.concat([Buffer.alloc(z),body]);
}
export interface KeyPair {privateKeyPem:string;publicKeyMultibase:string;keyId:string;did:string}
export function keyPair():KeyPair {
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const raw=Buffer.from(publicKey.export({format:'jwk'}).x!,'base64url');
  const m='z'+base58Encode(Buffer.concat([Buffer.from([0xed,0x01]),raw]));const did='did:key:'+m;
  return {privateKeyPem:privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicKeyMultibase:m,keyId:did+'#'+m,did};
}
export function publicKey(multibase:string):KeyObject {
  if(!multibase.startsWith('z'))throw new Error('UNSUPPORTED_KEY_ENCODING');
  const raw=base58Decode(multibase.slice(1));
  if(raw.length!==34||raw[0]!==0xed||raw[1]!==1||'z'+base58Encode(raw)!==multibase)throw new Error('INVALID_ED25519_KEY');
  return createPublicKey({key:{kty:'OKP',crv:'Ed25519',x:raw.subarray(2).toString('base64url')},format:'jwk'});
}
export function signBytes(key:KeyPair|string,bytes:Uint8Array):string {
  return sign(null,bytes,createPrivateKey(typeof key==='string'?key:key.privateKeyPem)).toString('base64url');
}
export function verifyBytes(multibase:string,bytes:Uint8Array,signature:string):boolean {
  try {if(!/^[A-Za-z0-9_-]{86}$/.test(signature))return false;const b=Buffer.from(signature,'base64url');if(b.toString('base64url')!==signature)return false;return verify(null,bytes,publicKey(multibase),b);}catch{return false;}
}
export function signObject(key:KeyPair|string,tag:string,value:unknown):string {return signBytes(key,domainBytes(tag,value));}
export function verifyObject(m:string,tag:string,value:unknown,s:string):boolean {return verifyBytes(m,domainBytes(tag,value),s);}
export function iso(ms:number):string{return new Date(ms).toISOString();}
export function isIso(s:string):boolean {return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&iso(Date.parse(s))===s;}
export function inTime(issued:string,expires:string,now:number,skewMs=30000):boolean {
  return isIso(issued)&&isIso(expires)&&Date.parse(issued)<=now+skewMs&&now<Date.parse(expires)&&Date.parse(issued)<Date.parse(expires);
}
