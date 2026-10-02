import test from 'node:test';
import assert from 'node:assert/strict';
import {advance,newSession,joinPlayer,submitAnswer,publicSession,playerView,quizSchema} from '../src/domain.js';
const quiz={id:'quiz',owner_id:'host',title:'Test',duration:30,questions:[{question:'Which answer is correct?',options:['One','Two'],correctAnswer:1,explanation:'Two is correct.'}]};
test('server enforces scoring, duplicate protection, stale questions and timer expiry',()=>{
 const s=newSession(quiz,'123456');const p=joinPlayer(s,'Andrew');advance(s,'next',1000);
 assert.equal(publicSession(s,2000).question.correctAnswer,undefined);
 assert.throws(()=>submitAnswer(s,p.id,1,1,2000),/changed/);
 submitAnswer(s,p.id,0,1,1000);assert.equal(p.score,1000);
 assert.equal(publicSession(s,1000).players[0].score,0);
 assert.equal(playerView(s,p.id,1000).points,undefined);
 assert.throws(()=>submitAnswer(s,p.id,0,0,2000),/already/);
 assert.throws(()=>advance(s,'next',2000),/Reveal/);
 advance(s,'reveal',2000);assert.equal(publicSession(s).question.correctAnswer,1);assert.equal(playerView(s,p.id).correct,true);
 advance(s,'next',3000);assert.equal(s.status,'finished');
});
test('deadline and late join protections',()=>{
 const s=newSession(quiz,'123456');const p=joinPlayer(s,'Ada');advance(s,'next',1000);
 assert.throws(()=>joinPlayer(s,'Late'),/already started/);
 assert.throws(()=>submitAnswer(s,p.id,0,1,31000),/closed/);
 assert.equal(publicSession(s,31000).status,'review');
 assert.equal(publicSession(s,31000).question.correctAnswer,1);
});
test('invalid questions and duplicates cannot be saved',()=>{
 assert.throws(()=>quizSchema.parse({...quiz,questions:[{...quiz.questions[0],correctAnswer:3}]}));
 assert.throws(()=>quizSchema.parse({...quiz,questions:[quiz.questions[0],quiz.questions[0]]}));
});
