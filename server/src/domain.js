import { z } from 'zod';
import { randomUUID } from 'node:crypto';
export function fail(message,status=400) { const e=new Error(message); e.status=status; throw e; }
export const configSchema=z.object({topic:z.string().trim().min(2).max(160),type:z.enum(['multiple-choice','true-false']),difficulty:z.enum(['beginner','intermediate','advanced']),count:z.number().int().min(1).max(20)});
export const questionSchema=z.object({question:z.string().trim().min(5).max(1000),options:z.array(z.string().trim().min(1).max(400)).min(2).max(4),correctAnswer:z.number().int().min(0).max(3),explanation:z.string().trim().min(3).max(1500)}).superRefine((q,ctx)=>{
 if(q.correctAnswer>=q.options.length)ctx.addIssue({code:'custom',message:'Correct answer index exceeds options.'});
 if(new Set(q.options.map(o=>o.toLowerCase())).size!==q.options.length)ctx.addIssue({code:'custom',message:'Options must be distinct.'});
});
export const quizSchema=z.object({title:z.string().trim().min(2).max(160),duration:z.number().int().min(10).max(120),source:z.enum(['gemini','demo','manual']).default('manual'),questions:z.array(questionSchema).min(1).max(20)}).superRefine((q,ctx)=>{
 if(new Set(q.questions.map(x=>x.question.toLowerCase())).size!==q.questions.length)ctx.addIssue({code:'custom',message:'Duplicate questions are not allowed.'});
});
export function newSession(quiz,code){return {code,ownerId:quiz.owner_id,quizId:quiz.id,title:quiz.title,questions:quiz.questions,duration:quiz.duration,status:'lobby',index:-1,deadline:null,players:[],version:0};}
export function publicSession(s,now=Date.now()) {
 const expired=s.status==='active' && now>=s.deadline;
 const revealed=s.status==='review'||s.status==='finished'||expired;
 const q=s.questions[s.index];
 return {code:s.code,title:s.title,status:expired?'review':s.status,index:s.index,total:s.questions.length,deadline:s.deadline,version:s.version,serverNow:now,
 question:q?{question:q.question,options:q.options,...(revealed?{correctAnswer:q.correctAnswer,explanation:q.explanation}:{})}:null,
 players:s.players.map(p=>({id:p.id,name:p.name,score:p.score-(!revealed?(p.answers[s.index]?.points||0):0),answered:Object.hasOwn(p.answers,String(s.index))})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name))};
}
export function joinPlayer(s,name) {
 if(s.status!=='lobby')fail('This quiz has already started.');
 if(s.players.length>=100)fail('Session is full.');
 const p={id:randomUUID(),name,score:0,answers:{}};s.players.push(p);s.version++;return p;
}
export function advance(s,action,now=Date.now()) {
 if(s.status==='finished')fail('Session has finished.');
 if(action==='finish'){s.status='finished';s.deadline=null;}
 else if(action==='reveal'){
  if(s.status!=='active')fail('There is no active question.');
  s.status='review';s.deadline=null;
 } else if(action==='next'){
  if(s.status==='active'&&now<s.deadline)fail('Reveal the answer before moving on.');
  if(s.index+1>=s.questions.length){s.status='finished';s.deadline=null;}
  else{s.index++;s.status='active';s.deadline=now+s.duration*1000;}
 } else fail('Unknown session action.');
 s.version++;
}
export function submitAnswer(s,playerId,index,answer,now=Date.now()) {
 const p=s.players.find(p=>p.id===playerId);if(!p)fail('Participant not found.',403);
 if(s.status!=='active'||now>=s.deadline)fail('This question is closed.',409);
 if(index!==s.index)fail('The question has changed. Refresh and try again.',409);
 if(Object.hasOwn(p.answers,String(index)))fail('You have already answered.',409);
 const q=s.questions[index];
 if(!Number.isInteger(answer)||answer<0||answer>=q.options.length)fail('Invalid answer.');
 const correct=answer===q.correctAnswer;
 const remaining=Math.max(0,Math.min(1,(s.deadline-now)/(s.duration*1000)));
 const points=correct?500+Math.round(500*remaining):0;
 p.answers[index]={answer,points};p.score+=points;s.version++;
 // Do not reveal correctness or points to the answering student before review.
 return {accepted:true};
}
export function playerView(s,id,now=Date.now()) {
 const p=s.players.find(p=>p.id===id);if(!p)fail('Participant not found.',403);
 const revealed=s.status==='review'||s.status==='finished'||(s.status==='active'&&now>=s.deadline);
 const answer=p.answers[s.index];
 return {id:p.id,name:p.name,score:p.score-(!revealed?(answer?.points||0):0),submitted:!!answer,answer:answer?.answer,
 ...(revealed&&answer?{points:answer.points,correct:answer.answer===s.questions[s.index].correctAnswer}: {})};
}
