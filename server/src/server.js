import {loadConfig} from './config.js';
import {createPool,migrate} from './db.js';
import {createRuntime} from './runtime.js';
const cfg=loadConfig();const pool=createPool();await migrate(pool);
const {http,io}=createRuntime(pool,cfg);
http.listen(cfg.port,'0.0.0.0',()=>console.log(`QuizFlow running on http://localhost:${cfg.port} (${cfg.provider} questions)`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
 io.close();http.close(async()=>{await pool.end();process.exit(0);});
 setTimeout(()=>process.exit(1),10000).unref();
});
