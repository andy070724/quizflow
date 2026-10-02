import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {randomUUID,randomInt} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {z,ZodError} from 'zod';
import {getSession,mutateSession} from './db.js';
import {fail,quizSchema,newSession,publicSession,playerView,advance,joinPlayer,submitAnswer} from './domain.js';
import {generateQuestions} from './ai.js';
export function readIdentity(req,cfg){
 const cookies=req.cookies||Object.fromEntries((req.headers.cookie||'').split(';').filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1))];}));
 const decode=(value,kind)=>{try{const t=jwt.verify(value,cfg.secret,{algorithms:['HS256']});return t.kind===kind?t:null;}catch{return null;}};
 return {teacher:decode(cookies.teacher,'teacher'),guest:decode(cookies.participant,'participant')};
}
export function createApp(pool,cfg,notify=()=>{}){
 const app=express();if(cfg.trustProxy)app.set('trust proxy',cfg.trustProxy);
 app.use(helmet({contentSecurityPolicy:{directives:{'connect-src':["'self'",'ws:','wss:'],'script-src':["'self'"],'style-src':["'self'","'unsafe-inline'"],'upgrade-insecure-requests':(cfg.secureCookies ?? cfg.production)?[]:null}}}));
 app.use(express.json({limit:'100kb'}));app.use(cookieParser());
 app.use('/api',rateLimit({windowMs:60000,limit:300,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many requests. Please wait a minute.'}}));
 // Same-origin application. Vite proxies requests in development; production serves React here.
 app.use('/api',(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   const origin=req.headers.origin;
   if(origin && origin!==cfg.origin) return res.status(403).json({error:'Untrusted request origin.'});
   if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'Cross-site requests are blocked.'});
   if(req.method!=='DELETE'&&!req.is('application/json'))return res.status(415).json({error:'Send application/json.'});
  }
  req.identity=readIdentity(req,cfg);next();
 });
 const auth=(req,res,next)=>req.identity.teacher?next():res.status(401).json({error:'Please sign in as a teacher.'});
 const cookieOptions={httpOnly:true,secure:cfg.secureCookies ?? cfg.production,sameSite:'lax',path:'/',maxAge:7*86400000};
 const token=(payload)=>jwt.sign(payload,cfg.secret,{expiresIn:'7d',algorithm:'HS256'});
 const authLimit=rateLimit({windowMs:15*60000,limit:30,message:{error:'Too many sign-in attempts. Please try later.'}});
 const aiLimit=rateLimit({windowMs:60000,limit:5,keyGenerator:req=>req.identity.teacher.sub,message:{error:'Generation limit reached. Wait a minute.'}});
 app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({status:'ok',provider:cfg.provider});}catch{res.status(503).json({status:'unavailable'});}});
 app.get('/api/auth/me',async(req,res)=>{
  if(!req.identity.teacher)return res.json({user:null});
  const {rows}=await pool.query('SELECT id,name,email FROM users WHERE id=$1',[req.identity.teacher.sub]);res.json({user:rows[0]||null});
 });
 const credentials=z.object({email:z.email().max(200).transform(x=>x.toLowerCase()),password:z.string().min(10).max(100),name:z.string().trim().min(2).max(60).optional()});
 for(const mode of ['register','login'])app.post(`/api/auth/${mode}`,authLimit,async(req,res)=>{
  const {email,password,name}=credentials.parse(req.body);
  let user;
  if(mode==='register'){
   if(!name)fail('Your name is required.');
   try{const {rows}=await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,email',[randomUUID(),name,email,await bcrypt.hash(password,12)]);user=rows[0];}
   catch(e){if(e.code==='23505')fail('An account with this email already exists.',409);throw e;}
  }else{
   const {rows}=await pool.query('SELECT * FROM users WHERE email=$1',[email]);user=rows[0];
   if(!user||!(await bcrypt.compare(password,user.password_hash)))fail('Invalid email or password.',401);
  }
  res.cookie('teacher',token({kind:'teacher',sub:user.id}),cookieOptions).json({user:{id:user.id,name:user.name,email:user.email}});
 });
 app.post('/api/auth/logout',(req,res)=>res.clearCookie('teacher',cookieOptions).json({ok:true}));
 app.post('/api/ai/questions',auth,aiLimit,async(req,res)=>res.json(await generateQuestions(req.body,cfg)));
 app.get('/api/quizzes',auth,async(req,res)=>{
  const {rows}=await pool.query('SELECT id,title,questions,duration,source,created_at FROM quizzes WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100',[req.identity.teacher.sub]);res.json({quizzes:rows});
 });
 app.post('/api/quizzes',auth,async(req,res)=>{
  const q=quizSchema.parse(req.body);const id=randomUUID();
  await pool.query('INSERT INTO quizzes(id,owner_id,title,questions,duration,source) VALUES($1,$2,$3,$4,$5,$6)',[id,req.identity.teacher.sub,q.title,JSON.stringify(q.questions),q.duration,q.source]);
  res.status(201).json({quiz:{id,...q}});
 });
 app.get('/api/sessions',auth,async(req,res)=>{
  const {rows}=await pool.query('SELECT data,created_at FROM sessions WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50',[req.identity.teacher.sub]);
  res.json({sessions:rows.map(r=>({...publicSession(r.data),createdAt:r.created_at}))});
 });
 app.post('/api/sessions',auth,async(req,res)=>{
  const {quizId}=z.object({quizId:z.uuid()}).parse(req.body);
  const {rows}=await pool.query('SELECT * FROM quizzes WHERE id=$1 AND owner_id=$2',[quizId,req.identity.teacher.sub]);
  if(!rows[0])fail('Quiz not found.',404);
  for(let tries=0;tries<5;tries++){
   const code=String(randomInt(100000,1000000));const s=newSession(rows[0],code);
   try{await pool.query('INSERT INTO sessions(code,owner_id,quiz_id,data) VALUES($1,$2,$3,$4)',[code,s.ownerId,quizId,JSON.stringify(s)]);return res.status(201).json({session:publicSession(s)});}
   catch(e){if(e.code!=='23505')throw e;}
  }
  fail('Could not allocate a session code. Try again.',503);
 });
 app.param('code',(req,res,next,code)=>{if(!/^\d{6}$/.test(code))return res.status(400).json({error:'Session code must be six digits.'});next();});
 const permitted=(s,identity)=>identity.teacher?.sub===s.ownerId||(identity.guest?.code===s.code&&s.players.some(p=>p.id===identity.guest.sub));
 app.get('/api/sessions/:code',async(req,res)=>{
  const s=await getSession(pool,req.params.code);if(!s)fail('Session not found.',404);if(!permitted(s,req.identity))fail('Join this session first.',403);
  res.json({session:publicSession(s),host:req.identity.teacher?.sub===s.ownerId,me:req.identity.guest?.code===s.code?playerView(s,req.identity.guest.sub):null});
 });
 app.post('/api/sessions/:code/join',async(req,res)=>{
  const {name}=z.object({name:z.string().trim().min(2).max(40)}).parse(req.body);
  const {data,result}=await mutateSession(pool,req.params.code,s=>{
   // Idempotent rejoin for the same browser, without creating duplicate participants.
   if(req.identity.guest?.code===s.code){const p=s.players.find(p=>p.id===req.identity.guest.sub);if(p)return p;}
   return joinPlayer(s,name);
  });
  res.cookie('participant',token({kind:'participant',sub:result.id,code:data.code}),cookieOptions).json({session:publicSession(data),me:playerView(data,result.id)});notify(data.code);
 });
 app.post('/api/sessions/:code/action',auth,async(req,res)=>{
  const {action,version}=z.object({action:z.enum(['next','reveal','finish']),version:z.number().int().nonnegative()}).parse(req.body);
  const {data}=await mutateSession(pool,req.params.code,s=>{
   if(s.ownerId!==req.identity.teacher.sub)fail('Only the session host can control this quiz.',403);
   if(s.version!==version)fail('Session changed. Try again using the latest state.',409);
   advance(s,action);
  });res.json({session:publicSession(data)});notify(data.code);
 });
 app.post('/api/sessions/:code/answers',async(req,res)=>{
  const {index,answer}=z.object({index:z.number().int().nonnegative(),answer:z.number().int().min(0).max(3)}).parse(req.body);
  if(req.identity.guest?.code!==req.params.code)fail('Join this session first.',403);
  const {result}=await mutateSession(pool,req.params.code,s=>submitAnswer(s,req.identity.guest.sub,index,answer));
  res.json(result);notify(req.params.code);
 });
 app.get('/api/sessions/:code/results.csv',auth,async(req,res)=>{
  const s=await getSession(pool,req.params.code);if(!s)fail('Session not found.',404);if(s.ownerId!==req.identity.teacher.sub)fail('Only the host may export results.',403);
  const escape=value=>'"'+String(value).replace(/"/g,'""')+'"';
  const safeName=name=>/^\s*[=+@\-\t\r]/.test(name)?"'"+name:name;
  const rows=[['Rank','Name','Score','Answers submitted'],...publicSession(s).players.map((p,i)=>[i+1,safeName(p.name),p.score,Object.keys(s.players.find(x=>x.id===p.id).answers).length])];
  res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="quizflow-${s.code}.csv"`}).send(rows.map(r=>r.map(escape).join(',')).join('\r\n'));
 });
 app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found.'}));
 const dist=fileURLToPath(new URL('../../client/dist/',import.meta.url));
 if(cfg.production){app.use(express.static(dist));app.get('/{*path}',(req,res)=>res.sendFile(dist+'index.html'));}
 app.use((err,req,res,next)=>{
  if(err instanceof ZodError)return res.status(400).json({error:err.issues.map(i=>i.message).join(' ')});
  if(err.type==='entity.parse.failed')return res.status(400).json({error:'Invalid JSON request.'});
  if(!err.status)console.error('Request failed:',err.code||err.name); // Avoid logging keys or raw provider responses.
  res.status(err.status||500).json({error:err.status?err.message:'Server error. Please try again.'});
 });
 return app;
}
