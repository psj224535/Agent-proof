import {createRequire} from 'node:module';
import {mkdirSync,openSync,writeFileSync,closeSync,readFileSync,lstatSync,chmodSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {bytes32Schema} from './schema.ts';
import {validate} from '../shared-schemas/json.ts';

const require=createRequire(new URL('../../integrations/package.json',import.meta.url));
export function loadViemAccounts():any{return require('viem/accounts');}
export interface EvmKey {address:string;account:any;signTypedData:(data:any)=>Promise<string>;signTransaction:(transaction:any)=>Promise<string>}
/** Local testnet-only key. The returned object has signing methods but no key bytes. */
export function loadEvmKey(file:string):EvmKey {
  const dir=dirname(file);mkdirSync(dir,{recursive:true,mode:0o700});
  if(lstatSync(dir).isSymbolicLink())throw new Error('KEY_DIRECTORY_SYMLINK');chmodSync(dir,0o700);
  const {generatePrivateKey,privateKeyToAccount}=loadViemAccounts();
  if(!existsSync(file)){
    let fd:number|undefined;
    try {fd=openSync(file,'wx',0o600);writeFileSync(fd,generatePrivateKey()+'\n');}
    catch(e:any){if(e.code!=='EEXIST')throw new Error('KEY_CREATION_FAILED');}
    finally{if(fd!==undefined)closeSync(fd);}
  }
  const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new Error('KEY_FILE_UNSAFE');chmodSync(file,0o600);
  const privateKey=readFileSync(file,'utf8').trim();if(!/^0x[0-9a-f]{64}$/.test(privateKey))throw new Error('KEY_FILE_INVALID');
  let account:any;try{account=privateKeyToAccount(privateKey);}catch{throw new Error('KEY_FILE_INVALID');}
  return Object.freeze({address:account.address,account,signTypedData:(data:any)=>account.signTypedData(data),signTransaction:(tx:any)=>account.signTransaction(tx)});
}
/** Exclusive creation makes nonce allocation durable and safe against parallel issuances. */
export class AuthorizationNonceStore {
  directory:string;
  constructor(directory:string){this.directory=directory;mkdirSync(directory,{recursive:true,mode:0o700});}
  claim(nonce:string):void {
    validate(bytes32Schema,nonce);let fd:number|undefined;
    try{fd=openSync(join(this.directory,nonce.slice(2).toLowerCase()),'wx',0o600);writeFileSync(fd,'issued\n');}
    catch(e:any){if(e.code==='EEXIST')throw new Error('AUTHORIZATION_NONCE_ALREADY_ISSUED');throw new Error('NONCE_PERSISTENCE_UNAVAILABLE');}
    finally{if(fd!==undefined)closeSync(fd);}
  }
}
