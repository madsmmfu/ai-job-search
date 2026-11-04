import test from 'node:test';
import assert from 'node:assert/strict';
import { readMarketDetail } from '../../src/lib/boss/market-details.mjs';
test('binds JD to exact job link, title and company; challenge stops collection',()=>{
 const offer={id:'job1',url:'https://www.zhipin.com/job_detail/job1.html',title:'内容负责人',company:'示例公司'};
 const oldDocument=globalThis.document,oldLocation=globalThis.location;
 let text='示例公司 '+ '真实岗位要求'.repeat(25);
 globalThis.location={origin:'https://www.zhipin.com'};
 globalThis.document={body:{innerText:'正常页面'},querySelectorAll:()=>[{href:offer.url}],querySelector:()=>({querySelector:()=>({textContent:offer.title}),get innerText(){return text;}})};
 try {
  assert.equal(readMarketDetail(offer).status,'ok');
  text='另一家公司 '+ '相同职位名称的其他要求'.repeat(20);
  assert.equal(readMarketDetail(offer).status,'loading');
  globalThis.document.body.innerText='请完成安全验证';
  assert.equal(readMarketDetail(offer).status,'blocked');
 } finally {globalThis.document=oldDocument;globalThis.location=oldLocation;}
});
