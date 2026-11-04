import test from 'node:test';
import assert from 'node:assert/strict';
import { sendResumeThroughBridge, resumeUploadFilename } from '../../src/lib/boss/send-resume.mjs';

const version={id:'0123456789abcdef-00000000-0000-0000-0000-123456789abc',company:'示例公司',title:'海外内容运营'};
const recipient={company:version.company,title:version.title,recruiter:'李女士',canSendResume:true};
function fixture(options={}) {
  let library=options.full?['a.pdf','b.pdf','c.pdf']:[], sent=0, upload=0, afterSend=false;
  const records=[];
  const bridge={command:async(action,args)=>{
    if(action==='navigate')return {};
    const code=args.code;
    if(code.startsWith('JSON.stringify((function readCurrentResumeChat')) return {value:JSON.stringify(options.mismatch?{...recipient,company:'另一家公司'}:options.disabled?{...recipient,canSendResume:false}:recipient)};
    const match=code.match(/\}\)\((.*)\)\)$/s); assert.ok(match);
    const [op,data]=JSON.parse('['+match[1]+']');
    let value=true;
    if(op==='library')value=library;
    if(op==='upload'){upload++; assert.ok(data.base64);}
    if(op==='confirmUpload')library=[resumeUploadFilename(version)];
    if(op==='evidence')value=afterSend&&!options.noReceipt?[{id:'new-id',text:'您的附件简历 示例公司... 已发送给Boss',failed:false}]:[];
    if(op==='send'){sent++;afterSend=true;if(options.sendThrows)throw new Error('timeout');}
    return {value:JSON.stringify(value)};
  }};
  return {bridge,records,save:async r=>records.push(r),wait:async()=>{},counts:()=>({sent,upload})};
}
async function run(f,previous){return sendResumeThroughBridge({...f,previous,version,pdf:Buffer.from('%PDF')});}
test('mismatch or platform-disabled recipient never uploads or sends',async()=>{
  for(const opts of [{mismatch:true},{disabled:true}]) {const f=fixture(opts);assert.equal((await run(f)).status,'blocked');assert.deepEqual(f.counts(),{sent:0,upload:0});}
});
test('uploads exact PDF, persists intent before one send and verifies new receipt',async()=>{
  const f=fixture();const r=await run(f);assert.equal(r.status,'sent');assert.deepEqual(f.counts(),{sent:1,upload:1});assert.deepEqual(f.records.map(r=>r.status),['uploaded','sending','sent']);
});
test('full library does not delete or send',async()=>{
  const f=fixture({full:true});const r=await run(f);assert.equal(r.status,'blocked');assert.match(r.message,/已满/);assert.deepEqual(f.counts(),{sent:0,upload:0});
});
test('timeout after click stays unknown, and persisted unknown blocks retry',async()=>{
  const f=fixture({sendThrows:true});assert.equal((await run(f)).status,'unknown');assert.equal(f.counts().sent,1);
  const g=fixture();assert.equal((await run(g,f.records.at(-1))).status,'unknown');assert.equal(g.counts().sent,0);
});
test('missing receipt is not successful; completed sends remain idempotent',async()=>{
  const f=fixture({noReceipt:true});assert.equal((await run(f)).status,'unknown');
  const g=fixture();assert.equal((await run(g,{status:'sent',filename:resumeUploadFilename(version)})).status,'sent');assert.equal(g.counts().sent,0);
});
