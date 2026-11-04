import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getCareerOpsRoot } from './path-resolver.mjs';

export class ResumeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function normalizeJobUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new ResumeError('请输入有效的 BOSS 直聘岗位链接。'); }
  if (url.origin !== 'https://www.zhipin.com' || url.username || url.password || !/^\/job_detail\/[A-Za-z0-9_-]+\.html$/.test(url.pathname)) throw new ResumeError('仅支持 BOSS 直聘岗位详情链接。');
  return url.origin + url.pathname;
}
export function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
export function outwardSource(cv) {
  return cv.split(/\r?\n/).filter(line => !/^\s*来源[：:]/.test(line)).join('\n').trim();
}
const TERMS = ['AI', 'AIGC', 'TikTok', 'YouTube', 'Twitter', 'Discord', 'Instagram', 'Facebook', 'SOP', '英文', '英语', '海外', '跨境', '内容', '新媒体', '短视频', '脚本', '团队', '管理', '数据', '复盘', '增长', '获客', '转化', '矩阵', '教育', '电商', '品牌', '社群', '活动', '产品', '选题', '投放', '小红书', '公众号'];
export function prioritizeExperience(source, signals) {
  const score = text => signals.reduce((sum, term) => sum + (text.toLowerCase().includes(term.toLowerCase()) ? 1 : 0), 0);
  const lines = source.split('\n');
  let inWork = false, start = -1;
  const reorder = end => {
    if(start < 0) return;
    const block = lines.slice(start, end).join('\n');
    const first = block.search(/^\s*[●•*]\s+/m);
    if(first < 0) return;
    const prefix=block.slice(0,first);
    const bullets=block.slice(first).split(/(?=^[ \t]*[●•*][ \t]+)/m).filter(Boolean);
    const sorted=bullets.map((text,index)=>({text,index,score:score(text)})).sort((a,b)=>b.score-a.score||a.index-b.index);
    // Retain each complete source bullet verbatim, including wrapped lines.
    const replacement=(prefix+sorted.map(item=>item.text.trimEnd()).join('\n')+'\n').split('\n');
    const count=end-start;
    lines.splice(start,count,...replacement);
    return replacement.length-count;
  };
  for(let i=0;i<=lines.length;i++) {
    const line=lines[i] || '';
    const heading=/^\s*##\s/.test(line);
    const boundary=i===lines.length || heading || (inWork && /^\s*\d{4}[.年/-]/.test(line));
    if(inWork && boundary && start>=0) { const diff=reorder(i)||0; i+=diff; start=-1; }
    if(heading) inWork=/Work Experience|工作经历|工作经验/i.test(line);
    if(inWork && /^\s*\d{4}[.年/-]/.test(line)) start=i;
  }
  return lines.join('\n');
}
export function tailorResume(cv, job) {
  const source = outwardSource(cv);
  if (!source || source.length > 150000) throw new ResumeError('原始简历为空或过长，请先检查 cv.md。');
  const units = [];
  for (const line of source.split('\n')) {
    if (/^\s*[●•*-]\s+/.test(line)) units.push(line.replace(/^\s*[●•*-]\s+/, '').trim());
    else if (units.length && line.trim() && !/^\s*(?:#|\d{4}[.年/-])/.test(line) && !/^\s*(?:外语|平台|AI能力|工具|新媒体技能)/.test(line)) {
      // Extracted PDF bullets wrap across lines; stop at blank/section/date boundaries.
      if (units[units.length - 1] !== null) units[units.length - 1] += '\n' + line.trim();
    } else if (!line.trim() || /^\s*(?:#|\d{4})/.test(line)) units.push(null);
  }
  const wanted = `${job.title}\n${job.jd}`.toLowerCase();
  const signals = TERMS.filter(term => wanted.includes(term.toLowerCase()));
  const scored = units.filter(Boolean).map((text, index) => ({ text, index, score: signals.reduce((sum, term) => sum + (text.toLowerCase().includes(term.toLowerCase()) ? 1 : 0), 0) }));
  const highlights = scored.filter(item => item.score > 0).sort((a,b) => b.score - a.score || a.index - b.index).slice(0,4).map(item => item.text);
  if (!highlights.length) throw new ResumeError('岗位需求与原简历暂未匹配到明确经历，请补充岗位职责后重试。');
  const intro = '您好，我对贵公司的岗位感兴趣。以下是我简历中的相关经历：\n' + highlights.slice(0,2).map(text => `• ${text.replace(/\n/g, '')}`).join('\n') + '\n期待进一步沟通。';
  const tailoredBody = prioritizeExperience(source, signals).replace(/^\s*## Professional Summary\s*\n[\s\S]*?(?=^\s*## |$(?![\s\S]))/m, '');
  const markdown = tailoredBody.replace(/^(#.*\n)/, '$1\n## 岗位相关经历\n' + highlights.map(text => `- ${text}`).join('\n') + '\n\n');
  return { highlights, intro, markdown, source, tailoredBody, method: '按岗位匹配原始经历' };
}
export function renderResumeHtml(result) {
  const body=result.tailoredBody || result.source;
  const firstSection=body.search(/^\s*## /m);
  const header=firstSection>=0 ? body.slice(0,firstSection) : '';
  const remaining=firstSection>=0 ? body.slice(firstSection) : body;
  const headings = {'Education':'教育经历','Work Experience':'工作经历','Skills':'专业技能','Professional Summary':'个人优势'};
  const section = text => text.split('\n').filter(line=>line.trim()).map(line => {
    if (/^\s*#{1,3}\s/.test(line)) { const name=line.replace(/^\s*#+\s*/, '').replace(/^CV\s*--\s*/, '').trim(); return `<h2>${escapeHtml(headings[name] || name)}</h2>`; }
    return `<div class="line${/^\s*\d{4}[.年/-]/.test(line) ? ' entry' : ''}">${escapeHtml(line)}</div>`;
  }).join('\n');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>个人简历</title><style>@page{size:A4;margin:16mm}body{font-family:"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif;color:#18222d;font-size:10pt;line-height:1.55}h2{font-size:14pt;color:#0d625c;margin:16px 0 8px;break-after:avoid}.line{white-space:pre-wrap;overflow-wrap:anywhere}.entry{margin-top:12px;break-after:avoid}ul{padding-left:20px}li{margin:5px 0;break-inside:avoid}</style><body>${section(header)}<h2>岗位相关经历</h2><ul>${result.highlights.map(text => `<li>${escapeHtml(text.replace(/\n/g,''))}</li>`).join('')}</ul>${section(remaining)}</body></html>`;
}
async function safePath(root, relative, exists = true) {
  const base = await fs.realpath(root);
  const target = path.resolve(base, relative);
  if (!target.startsWith(base + path.sep)) throw new ResumeError('文件路径无效。');
  const parts = path.relative(base, target).split(path.sep);
  let current = base;
  for (let i=0; i<parts.length; i++) {
    current = path.join(current, parts[i]);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new ResumeError('不支持符号链接文件。'); }
    catch (error) { if (error.code === 'ENOENT' && !exists) continue; throw error; }
  }
  return target;
}
export function validateResumeId(id) { if (!/^[a-f0-9]{16}-[a-f0-9-]{36}$/.test(id)) throw new ResumeError('简历版本不存在。',404); return id; }
async function originalRelative(root) {
  const directory = await safePath(root, 'documents/boss-attachment');
  const files = (await fs.readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && /\.pdf$/i.test(entry.name));
  if (files.length !== 1) throw new ResumeError('原始简历需要唯一的已下载 PDF，请先检查附件目录。', 404);
  return `documents/boss-attachment/${files[0].name}`;
}
export async function readResumeFile(root, id) {
  const relative = id === 'original' ? await originalRelative(root) : `output/boss-resumes/${validateResumeId(id)}/resume.pdf`;
  try { const filename = await safePath(root, relative); const data = await fs.readFile(filename); if (!data.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new ResumeError('简历文件格式无效。'); return data; }
  catch(error) { if (error.code === 'ENOENT') throw new ResumeError('简历文件不存在。',404); throw error; }
}
export async function listResumeVersions(root) {
  let originalUrl = null;
  try { await safePath(root, await originalRelative(root)); originalUrl='/api/boss/resumes/original?download=1'; } catch {}
  let directory;
  try { directory=await safePath(root,'output/boss-resumes'); } catch(error) { if(error.code==='ENOENT') return {versions:[],originalUrl}; throw error; }
  const versions=[];
  for (const entry of await fs.readdir(directory,{withFileTypes:true})) {
    if (!entry.isDirectory() || !/^[a-f0-9]{16}-[a-f0-9-]{36}$/.test(entry.name)) continue;
    try { const metadata=await safePath(root,`output/boss-resumes/${entry.name}/metadata.json`); const value=JSON.parse(await fs.readFile(metadata,'utf8')); await safePath(root,`output/boss-resumes/${entry.name}/resume.pdf`); if(value.id===entry.name) versions.push(value); } catch {}
  }
  return {versions:versions.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),originalUrl};
}
async function renderPdf(html, output, root) {
  const {renderHtmlToPdf}=await import('./generate-pdf.mjs');
  const {chromium}=await import('playwright');
  let browser; let timer;
  try {
    return await Promise.race([
      renderHtmlToPdf(html,output,{workspaceRoot:root,baseDir:path.dirname(output),format:'a4',maxPages:6,launchBrowser:async options => {browser=await chromium.launch({...options,timeout:20000});return browser;}}),
      new Promise((_,reject)=> {timer=setTimeout(()=>reject(new ResumeError('简历生成超时，请稍后重试。',504)),45000);}),
    ]);
  } finally { clearTimeout(timer); await browser?.close().catch(()=>{}); }
}
export async function createResumeVersion(root, input, options={}) {
  if (!input || typeof input !== 'object') throw new ResumeError('请求格式无效。');
  const url=normalizeJobUrl(input.url);
  const clean = (value,label,max) => { if(typeof value!=='string' || !value.trim() || value.length>max) throw new ResumeError(`${label}为空或超过长度限制。`);return value.trim(); };
  const company=clean(input.company,'公司名称',200), title=clean(input.title,'岗位名称',300);
  let jd=typeof input.jd==='string'?input.jd.trim():'';
  if(jd.length>30000) throw new ResumeError('岗位职责最多支持 30000 字。');
  if(!jd) {
    const jobId=new URL(url).pathname.split('/').pop().replace('.html','');
    try {const filename=await safePath(root,`documents/boss-research/${jobId}.json`); jd=JSON.parse(await fs.readFile(filename,'utf8')).text || '';} catch(error) {if(error instanceof ResumeError) throw error;}
    if(typeof jd!=='string' || !jd.trim() || jd.length>30000) throw new ResumeError('尚未保存该岗位职责，请粘贴完整岗位要求后生成。');
  }
  const cvPath=await safePath(root,'cv.md');
  const cv=await fs.readFile(cvPath,'utf8');
  const result=tailorResume(cv,{title,jd});
  const id=createHash('sha256').update(url).digest('hex').slice(0,16)+'-'+randomUUID();
  const relative=`output/boss-resumes/${id}`;
  const directory=await safePath(root,relative,false);
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  await safePath(root,relative);
  try {
    await fs.writeFile(path.join(directory,'resume.md'),result.markdown,{mode:0o600,flag:'wx'});
    await fs.writeFile(path.join(directory,'resume.html'),renderResumeHtml(result),{mode:0o600,flag:'wx'});
    const rendered=await (options.render || renderPdf)(renderResumeHtml(result),path.join(directory,'resume.pdf'),root);
    const pdf=await fs.readFile(await safePath(root,relative+'/resume.pdf'));
    if (!pdf.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new ResumeError('PDF 生成失败，请重试。',500);
    const metadata={id,company,title,url,createdAt:new Date().toISOString(),highlights:result.highlights,intro:result.intro,method:result.method,pageCount:rendered?.pageCount ?? null,pdfUrl:`/api/boss/resumes/${id}`,downloadUrl:`/api/boss/resumes/${id}?download=1`};
    await fs.writeFile(path.join(directory,'metadata.json.tmp'),JSON.stringify(metadata,null,2),{mode:0o600,flag:'wx'});
    await fs.rename(path.join(directory,'metadata.json.tmp'),path.join(directory,'metadata.json'));
    return metadata;
  } catch(error) {await fs.rm(directory,{recursive:true,force:true});throw error;}
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const root=getCareerOpsRoot(), action=process.argv[2];
    if(action==='list') console.log(JSON.stringify(await listResumeVersions(root)));
    else if(action==='create') {let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>50000)throw new ResumeError('请求内容过长。');}console.log(JSON.stringify(await createResumeVersion(root,JSON.parse(input))));}
    else if(action==='read') {const data=await readResumeFile(root,process.argv[3]);process.stdout.write(data);}
    else throw new ResumeError('未知操作。');
  } catch(error) {console.error(JSON.stringify({error:error instanceof ResumeError?error.message:'简历处理失败，请检查本地简历和 PDF 运行环境。',status:error.status||500}));process.exitCode=1;}
}
