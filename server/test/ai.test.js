import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuestions} from '../src/ai.js';
const input={topic:'Biology',type:'multiple-choice',difficulty:'beginner',count:1};
const q={question:'What carries genetic information?',options:['DNA','Water','Sand','Air'],correctAnswer:0,explanation:'DNA carries genetic information.'};
test('demo mode is explicit and does not pretend to generate requested topics',async()=>{
 const d=await generateQuestions(input,{provider:'demo'});assert.equal(d.source,'demo');assert.match(d.notice,/only in Gemini/);
 await assert.rejects(()=>generateQuestions({...input,count:20},{provider:'demo'}),/up to 10/);
});
test('Gemini structured generation validates data and keeps key in server headers',async()=>{
 let requests=0;
 const fetcher=async(url,opts)=>{requests++;assert.equal(opts.headers['x-goog-api-key'],'secret');assert.equal(JSON.parse(opts.body).generationConfig.responseFormat.text.schema.properties.questions.minItems,1);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({questions:[q]})}]}}]})};};
 const data=await generateQuestions(input,{provider:'gemini',geminiKey:'secret',geminiModel:'test-model'},fetcher);assert.equal(data.source,'gemini');assert.equal(requests,1);
});
test('invalid model output retries once, while quota errors are exposed clearly',async()=>{
 let n=0;await assert.rejects(()=>generateQuestions(input,{provider:'gemini'},async()=>{n++;return {ok:true,json:async()=>({candidates:[]})};}),/invalid quiz/);assert.equal(n,2);
 await assert.rejects(()=>generateQuestions(input,{provider:'gemini'},async()=>({ok:false,status:429})),/quota exceeded/);
});
