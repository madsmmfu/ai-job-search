import test from 'node:test';
import assert from 'node:assert/strict';
import {sendExistingResume,ORIGINAL_RESUME_FILENAME as filename} from '../boss-existing-resume.mjs';
const recipient={company:'公司',title:'小红书运营',recruiter:'王女士'};
function fixture({mismatch=false,missing=false,lost=false,existing=false}={}) {
 const saves=[],operations=[];let evidenceCalls=0;
 return {saves,operations,options:{recipient,filename,expectedIncomingId:'incoming1',save:async r=>saves.push(r),wait:async()=>{},command:async(_,{code})=>{
  if(code.includes('function readCurrentResumeChat'))return {value:JSON.stringify({...recipient,company:mismatch?'其他公司':recipient.company,canSendResume:true})};
  if(code.includes('!!document.querySelector'))return {value:'false'};
  const op=JSON.parse(code.match(/const op=("[^"]+")/)[1]);operations.push(op);
  if(op==='evidence'){evidenceCalls++;return {value:JSON.stringify(existing||evidenceCalls>1&&!lost?[{id:'receipt',exact:true,failed:false,text:filename+' 已发送'}]:[])};}
  if(op==='choose')return {value:JSON.stringify(!missing)};
  if(op==='send'&&lost)throw Error('connection lost');
  return {value:'true'};
 }}};
}
test('existing attachment is selected and sending saved before verified receipt',async()=>{
 const f=fixture();const r=await sendExistingResume(f.options);assert.equal(r.status,'sent');assert.deepEqual(f.saves.map(r=>r.status),['sending','sent']);assert.ok(!f.operations.includes('upload'));assert.ok(f.operations.includes('send'));
});
test('recipient mismatch and missing exact filename never send',async()=>{
 for(const config of [{mismatch:true},{missing:true}]){const f=fixture(config);const r=await sendExistingResume(f.options);assert.equal(r.status,'blocked');assert.ok(!f.operations.includes('send'));assert.equal(f.saves.length,0);}
});
test('lost send response records unknown; restart never repeats click',async()=>{
 const f=fixture({lost:true});assert.equal((await sendExistingResume(f.options)).status,'unknown');assert.equal(f.saves.at(-1).status,'unknown');const n=f.operations.length;await sendExistingResume({...f.options,previous:f.saves.at(-1)});assert.equal(f.operations.length,n);
});
test('already sent receipt is idempotent without selecting or sending',async()=>{
 const f=fixture({existing:true});assert.equal((await sendExistingResume(f.options)).status,'sent');assert.deepEqual(f.operations,['evidence']);
});
