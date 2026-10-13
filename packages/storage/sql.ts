import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export type Row=Record<string,unknown>;
export interface Sql {
 all(sql:string,params?:unknown[]):Promise<Row[]>;
 transaction<T>(f:(tx:Sql)=>Promise<T>):Promise<T>;
 close():Promise<void>;
 dialect:'sqlite'|'postgres';
}
export class SQLite implements Sql {
 dialect='sqlite' as const;db:DatabaseSync;private queue:Promise<unknown>=Promise.resolve();
 constructor(path:string){if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');}
 private direct(sql:string,params:unknown[]=[]):Row[]{return this.db.prepare(sql).all(...params as (string|number|null)[]) as Row[];}
 private enqueue<T>(f:()=>Promise<T>):Promise<T>{const task=this.queue.then(f);this.queue=task.catch(()=>{});return task;}
 all(sql:string,params:unknown[]=[]):Promise<Row[]>{return this.enqueue(async()=>this.direct(sql,params));}
 transaction<T>(f:(tx:Sql)=>Promise<T>):Promise<T>{return this.enqueue(async()=>{
  this.db.exec('BEGIN IMMEDIATE');
  const tx:Sql={dialect:'sqlite',all:async(s,p)=>this.direct(s,p),transaction:async()=>{throw new Error('NESTED_TX_UNSUPPORTED');},close:async()=>{throw new Error('CLOSE_TX_UNSUPPORTED');}};
  try{const result=await f(tx);this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}
 });}
 async close(){await this.queue;this.db.close();}
}
/** A separate adapter: install the pinned integrations package to use PostgreSQL.
 * No in-memory replay fallback is allowed when the DB is unavailable.
 */
export async function openPostgres(connectionString:string):Promise<Sql> {
 const {createRequire}=await import('node:module');
 const require=createRequire(new URL('../../integrations/package.json',import.meta.url));
 const {Pool}=require('pg') as {Pool:new(options:object)=>PgPool};
 const pool=new Pool({connectionString,max:10,connectionTimeoutMillis:3000});
 const bind=(client:PgClient):Sql=>({dialect:'postgres',
  async all(sql,params=[]){let i=0;return (await client.query(sql.replace(/\?/g,()=>'$'+(++i)),params)).rows;},
  async transaction<T>(f:(tx:Sql)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');const r=await f(bind(c));await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},
  async close(){await pool.end();}
 });
 await pool.query('SELECT 1');return bind(pool);
}
interface PgClient {query(sql:string,params?:unknown[]):Promise<{rows:Row[]}>}
interface PgPool extends PgClient {connect():Promise<PgClient&{release():void}>;end():Promise<void>}
