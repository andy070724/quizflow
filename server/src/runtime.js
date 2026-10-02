import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {createApp,readIdentity} from './app.js';
import {getSession} from './db.js';
export function createRuntime(pool,cfg){
 let io;
 const app=createApp(pool,cfg,code=>io.to(code).emit('session:changed'));
 const http=createServer(app);
 io=new Server(http,{cors:{origin:cfg.origin,credentials:true},allowRequest:(req,callback)=>callback(null,!req.headers.origin||req.headers.origin===cfg.origin)});
 io.on('connection',socket=>{
  let attempts=0;
  socket.on('session:watch',async(code,ack)=>{
   const reply=typeof ack==='function'?ack:()=>{};
   if(++attempts>20)return reply({error:'Reconnect before watching more sessions.'});
   try{
    if(typeof code!=='string'||!/^\d{6}$/.test(code))return reply({error:'Invalid session code.'});
    const identity=readIdentity(socket.request,cfg);const s=await getSession(pool,code);
    if(!s || !(identity.teacher?.sub===s.ownerId || (identity.guest?.code===code&&s.players.some(p=>p.id===identity.guest.sub))))return reply({error:'Join the session first.'});
    for(const room of socket.rooms)if(room!==socket.id)socket.leave(room);
    socket.join(code);reply({ok:true});
   }catch{reply({error:'Could not watch the session.'});}
  });
 });
 return {app,http,io};
}
