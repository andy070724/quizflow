import {PGlite} from '@electric-sql/pglite';
// PostgreSQL WASM engine: tests use the real schema, SQL and transaction logic.
// A mutex models a single pooled connection; deployment uses node-postgres.
export function testPool(){
 const db=new PGlite();let queue=Promise.resolve();
 const lock=async()=>{let release;const next=new Promise(r=>release=r);const previous=queue;queue=next;await previous;return release;};
 const query=async(sql,args)=>args?db.query(sql,args):sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql);
 return {async query(sql,args){const release=await lock();try{return await query(sql,args);}finally{release();}},async connect(){const release=await lock();return {query,release};},async end(){await queue;await db.close();}};
}
