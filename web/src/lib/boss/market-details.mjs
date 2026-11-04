export function readMarketDetail(offer, click = false) {
  if(location.origin!=='https://www.zhipin.com') return {status:'error'};
  if(/安全验证|访问过于频繁|人机验证|请完成验证/.test(document.body.innerText)) return {status:'blocked'};
  const anchor=[...document.querySelectorAll('.job-card-box a[href*="/job_detail/"]')].find(a=>new URL(a.href).pathname===new URL(offer.url).pathname);
  if(!anchor)return {status:'error'};
  if(click){anchor.click();return {status:'loading'};}
  const root=document.querySelector('.job-detail-box');
  const title=root?.querySelector('.job-name')?.textContent?.trim();
  const text=root?.innerText || '';
  return title===offer.title && text.includes(offer.company) && text.length>100 ? {status:'ok',text:text.slice(0,30000)} : {status:'loading'};
}

export async function readMarketDetails(command, offers, wait=ms=>new Promise(r=>setTimeout(r,ms))) {
  const records=[];
  const read=async(offer,click)=>{
    const raw=await command('evaluate',{code:`JSON.stringify((${readMarketDetail.toString()})(${JSON.stringify(offer)},${click}))`});
    return typeof raw.value==='string'?JSON.parse(raw.value):raw.value;
  };
  for(const offer of offers.slice(0,3)) {
    await wait(1200);
    let result=await read(offer,true);
    if(result.status==='blocked')return {status:'blocked',records};
    for(let n=0;n<5;n++) {
      await wait(500);result=await read(offer,false);
      if(result.status==='blocked')return {status:'blocked',records};
      if(result.status==='ok'){records.push({id:offer.id,requirements:result.text});break;}
      if(result.status==='error')break;
    }
  }
  return {status:'ok',records};
}
