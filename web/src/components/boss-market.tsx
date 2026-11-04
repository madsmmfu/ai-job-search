"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, BriefcaseBusiness, Check, ChevronDown, ExternalLink, Lightbulb, LoaderCircle, MapPin, RefreshCw, Target, TrendingUp } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

type Distribution = { min: number; q1: number; median: number; q3: number; max: number };
type Evidence = { skill: string; quote: string };
type MarketReport = {
  city: string;
  collectedAt: string | null;
  collectionStatus: string | { status: string; message?: string } | null;
  total: number;
  requirementsCount: number;
  collectionMessage?: string;
  roles: { role: string; count: number; monthlyMedian: number | null; validSalaryCount: number }[];
  skills: { skill: string; count: number; jobIds: string[] }[];
  salary: { validCount: number; unknownCount: number; monthlyCount: number; annualCount: number; monthly: Distribution | null; annual: Distribution | null; confidence: string; note: string };
  career: {
    source: string;
    evidence: Evidence[];
    matched: (Evidence & { count: number; jobIds: string[] })[];
    toVerify: { skill: string; count: number; jobIds: string[] }[];
    directions: { role: string; sampleCount: number; evidence: Evidence[] }[];
    trajectory?: { period: string; title: string; goal: string }[];
    plan: { days: string; title: string; actions: string[] }[];
    salaryAdvice: { range: [number, number] | null; stretch: number | null; basis: string; confidence: string; perRole: { role: string; count: number; range: [number, number]; confidence: string; evidenceSkills: string[] }[] };
  };
  observations: { id: string; title: string; company: string; location: string; salaryText: string; salaryVerified: boolean; salarySource?: string; salaryCapturedAt?: string; url: string; capturedAt?: string; keyword?: string; experience?: string; education?: string }[];
};

const sectionClass = "rounded-2xl border border-border bg-surface p-5 md:p-6";
const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-faint focus:border-brand/60 disabled:opacity-60";
const formatNumber = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
const salaryK = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? `${formatNumber(value / 1000)}K` : "暂无可用数据";
function timestamp(value?: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return "尚未采集";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
function safeBossUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "www.zhipin.com" && /^\/job_detail\/[A-Za-z0-9_-]+\.html$/.test(url.pathname) ? `${url.origin}${url.pathname}` : null; }
  catch { return null; }
}
function SectionHeading({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return <div className="mb-5"><h2 className="flex items-center gap-2 text-base font-semibold">{icon}{title}</h2>{children && <p className="mt-2 text-xs leading-5 text-muted">{children}</p>}</div>;
}
function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm leading-6 text-muted">{children}</p>;
}

export function BossMarket() {
  const [report, setReport] = useState<MarketReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [keywords, setKeywords] = useState("AI内容运营，海外内容运营，新媒体运营负责人");
  const [error, setError] = useState("");
  const [collectionMessage, setCollectionMessage] = useState("");
  const [showAll, setShowAll] = useState(false);
  const requestLock = useRef(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/boss/market", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "读取分析失败，请刷新重试。");
      if (active) setReport(data as MarketReport);
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "读取分析失败。"); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  async function collect() {
    if (requestLock.current) return;
    const terms = [...new Set(keywords.split(/[，,\n]/).map((term) => term.trim()).filter(Boolean))];
    if (!terms.length || terms.length > 3 || terms.some((term) => term.length > 60)) { setError("请输入 1 至 3 个关键词，用逗号分隔，每个不超过 60 字。"); return; }
    requestLock.current = true;
    setCollecting(true);
    setError("");
    setCollectionMessage("");
    try {
      const response = await fetch("/api/boss/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "collect", keywords: terms }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "采集未完成，请检查 Edge 中的 BOSS 页面。");
      setReport(data as MarketReport);
      const status = data.collectionStatus;
      setCollectionMessage(data.collectionMessage || (typeof status === "object" && status?.message ? status.message : "已刷新采集结果，以下分析以保存的样本为依据。"));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "采集未完成，已保存的分析仍可查看。"); }
    finally { setCollecting(false); requestLock.current = false; }
  }

  const salary = report?.salary;
  const monthly = salary?.monthly;
  const total = report?.total || 0;
  const unknownRatio = total ? Math.round((salary?.unknownCount || 0) / total * 100) : null;
  const roles = report?.roles || [];
  const skills = report?.skills || [];
  const career = report?.career;
  const observations = report?.observations || [];
  const sourceIndexes = new Map(observations.map((job, index) => [job.id, index + 1]));
  const collectionStatus = typeof report?.collectionStatus === "object" ? report.collectionStatus?.status : report?.collectionStatus;
  const collectionStatusMessage = typeof report?.collectionStatus === "object" ? report.collectionStatus?.message : ({ blocked: "上次采集遇到 BOSS 安全验证或访问限制，已停止。请查看 Edge 中的提示后手动重试。", login_required: "BOSS 登录已失效，请先在 Edge 登录，再更新样本。", error: "上次采集未完整完成，以下仍为已保存的样本。请检查 Edge 页面后重试。" } as Record<string, string>)[collectionStatus || ""];

  function sources(ids: string[]) {
    const available = ids.filter((id) => sourceIndexes.has(id)).slice(0, 3);
    return available.length ? <span className="ml-1 inline-flex flex-wrap gap-1">{available.map((id) => <a key={id} href={`#sample-${id}`} onClick={() => setShowAll(true)} className="text-brand-text underline decoration-brand/30 underline-offset-2" aria-label={`查看样本 ${sourceIndexes.get(id)}`}>[{sourceIndexes.get(id)}]</a>)}</span> : null;
  }

  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-3 flex items-center gap-3"><span className="rounded-xl bg-brand-soft p-2.5 text-brand"><BarChart3 className="size-6" /></span><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">市场与职业分析</h1></div><p className="max-w-2xl text-sm leading-6 text-muted">先看岗位需求与薪资，再决定下一步怎么走。用真实招聘样本和你的履历，形成可执行的求职策略。</p></div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted"><MapPin className="size-3.5" />杭州 · BOSS 直聘</span>
    </header>

    <section className={sectionClass} aria-label="更新招聘样本">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">收集你关心的岗位</h2><p className="mt-1.5 text-xs leading-5 text-muted">通过已登录的 Edge 逐个搜索关键词，读取页面上展示的岗位。每次最多 3 组搜索，遇到登录失效或验证提示即停止。</p></div><p className="shrink-0 text-xs text-faint">最近采集 {timestamp(report?.collectedAt)}</p></div>
      <form onSubmit={(event) => { event.preventDefault(); void collect(); }} className="mt-4 flex flex-col gap-3 sm:flex-row"><label htmlFor="market-keywords" className="sr-only">采集关键词，以逗号分隔，最多三组</label><input id="market-keywords" value={keywords} disabled={collecting} onChange={(event) => setKeywords(event.target.value)} className={inputClass} placeholder="例如：AI内容运营，海外内容运营" /><Button type="submit" disabled={collecting || !loaded} className="shrink-0">{collecting ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{collecting ? "正在读取 BOSS 样本…" : "更新 BOSS 样本"}</Button></form>
      <div aria-live="polite">{collecting && <p className="mt-3 text-xs leading-5 text-muted">正在使用 Edge 中的 BOSS 页面，请暂时保留当前浏览器窗口。已有分析保持可读，完成后会更新；这里不显示预估进度。</p>}{error && <p role="alert" className="mt-3 text-sm leading-6 text-red-600">{error}{report && " 已保存的样本仍显示在下方。"}</p>}{collectionMessage && <p role="status" className="mt-3 text-sm leading-6 text-brand-text">{collectionMessage}</p>}{!collectionMessage && collectionStatusMessage && collectionStatus !== "ok" && <p className="mt-3 text-sm leading-6 text-muted">{collectionStatusMessage}</p>}</div>
    </section>

    {!loaded ? <div role="status" className="flex items-center gap-2 rounded-2xl border border-border p-8 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" />正在读取已保存的市场分析…</div> : !report || !total ? <section className="rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center"><BarChart3 className="mx-auto size-9 text-faint" /><h2 className="mt-4 text-lg font-semibold">先收集一批杭州岗位</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-muted">登录 Edge 中的 BOSS 后，点击“更新 BOSS 样本”。有了真实样本，这里会展示岗位方向、需求技能、薪资分布，以及与你履历关联的职业和提升建议。</p><Link href="/explore" className={`${buttonVariants({ variant: "outline" })} mt-5`}>前往 BOSS 找工作<ArrowRight className="size-4" /></Link></section> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="去重岗位样本" value={String(total)} unit="个" description="仅限本次搜索范围与已保存样本" />
        <Stat label="可解析薪资" value={String(salary?.validCount || 0)} unit="个" description={`另有 ${salary?.unknownCount || 0} 个未知 · 占 ${unknownRatio}%`} />
        <Stat label="月薪区间中点的中位数" value={monthly ? salaryK(monthly.median) : "待补充"} unit={monthly ? "/ 月" : ""} description={`基于 ${salary?.monthlyCount || 0} 个可比的月薪样本`} />
        <Stat label="分析置信度" value={salary?.confidence === "moderate" ? "中等" : "较低"} description="样本量、搜索偏差及缺失数据都会影响结论" />
      </div>
      <p className="rounded-xl bg-brand-soft px-4 py-3 text-xs leading-6 text-brand-text">分析范围：杭州、BOSS 直聘中已采集的岗位。岗位数和技能频次代表这批搜索样本，不代表杭州全市场的岗位总量或市场份额。招聘标价也不等于最终录用薪资。</p>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className={sectionClass} id="market-overview"><SectionHeading icon={<BriefcaseBusiness className="size-4 text-brand" />} title="市场分析 · 岗位方向">对样本岗位按方向分组，帮助判断你的搜索重点；每个岗位归入一个主要方向，分类以岗位标题为线索。</SectionHeading>{roles.length ? <div className="space-y-5">{roles.map((role) => <div key={role.role}><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{role.role}</span><span className="text-xs text-muted">{role.count} 个样本{role.monthlyMedian !== null && ` · 中位月薪 ${salaryK(role.monthlyMedian)}`}</span></div><div className="h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, role.count / Math.max(...roles.map((item) => item.count), 1) * 100)}%` }} /></div>{role.validSalaryCount > 0 && <p className="mt-1.5 text-[11px] text-faint">薪资基于该方向 {role.validSalaryCount} 个可比样本</p>}</div>)}</div> : <EmptyNote>当前样本尚未识别出可归类的岗位方向。</EmptyNote>}</section>
        <section className={sectionClass}><SectionHeading icon={<TrendingUp className="size-4 text-brand" />} title="需求信号 · 技能频次">从已保存的岗位要求中识别关键词。当前 {report.requirementsCount} / {total} 个样本具备可分析的岗位要求，频次以已读岗位要求为分母，未读取详情不视为不需要该技能。</SectionHeading>{skills.length ? <div className="space-y-3.5">{skills.slice(0, 10).map((skill) => <div key={skill.skill} className="flex items-center gap-3"><span className="min-w-0 flex-1 text-sm">{skill.skill}{sources(skill.jobIds)}</span><span className="h-1.5 w-20 overflow-hidden rounded-full bg-background sm:w-28"><span className="block h-full rounded-full bg-brand/70" style={{ width: `${Math.min(100, skill.count / Math.max(1, report.requirementsCount) * 100)}%` }} /></span><span className="w-14 text-right text-xs tabular-nums text-muted">{skill.count}/{report.requirementsCount}</span></div>)}</div> : <EmptyNote>岗位文本信息较少，暂不足以形成技能频次分析。</EmptyNote>}</section>
      </div>

      <section className={sectionClass} id="salary-analysis"><SectionHeading icon={<BarChart3 className="size-4 text-brand" />} title="薪资分析">使用可解析的招聘薪资区间中点计算分布；月薪与年薪分别统计，未知薪资不参与分位数。</SectionHeading><div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>{monthly ? <><div className="grid grid-cols-3 gap-3"><SalaryMetric label="25% 分位" value={monthly.q1} /><SalaryMetric label="中位数" value={monthly.median} highlight /><SalaryMetric label="75% 分位" value={monthly.q3} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background px-4 py-3 text-xs text-muted"><span>样本中点最低 {salaryK(monthly.min)}/月</span><span>最高 {salaryK(monthly.max)}/月</span></div><p className="mt-3 text-xs leading-5 text-muted">25%～75% 分位表示中间一半样本区间中点的范围，不是个人一定能获得的报价。</p></> : <EmptyNote>当前没有可比较的月薪。无法读取或面议的薪资会保留为未知，不估填数字。</EmptyNote>}</div>
        <div className="space-y-3 rounded-xl border border-border p-4"><h3 className="text-sm font-semibold">薪资数据口径</h3><p className="text-xs leading-6 text-muted">月薪样本 {salary?.monthlyCount || 0} 个 · 明确年薪样本 {salary?.annualCount || 0} 个 · 未知 {salary?.unknownCount || 0} 个（{unknownRatio}%）</p>{salary?.annual && <p className="text-xs leading-6 text-muted">明确年薪样本中位数：{salaryK(salary.annual.median)}/年。与月薪分开，不混合推算。</p>}<p className="text-xs leading-6 text-muted">{salary?.note}</p><p className="text-xs leading-6 text-muted">多薪只有在岗位明确注明时才可用于年化；奖金、绩效、提成、试用期折扣等需与招聘方确认。</p></div>
      </div></section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className={sectionClass} id="career-advice"><SectionHeading icon={<Target className="size-4 text-brand" />} title="职业生涯建议">将岗位需求与 {career?.source || "已保存履历"} 中的证据对应。关键词匹配是方向线索，还需用项目案例验证岗位适配。</SectionHeading>{career?.directions?.length ? <div className="space-y-3">{career.directions.map((direction, index) => <article key={direction.role} className="rounded-xl border border-border p-4"><div className="flex items-start gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-xs font-semibold text-brand-text">{index + 1}</span><div><h3 className="text-sm font-semibold">{direction.role}</h3><p className="mt-1 text-xs text-muted">样本中相关岗位 {direction.sampleCount} 个</p></div></div><ul className="mt-3 space-y-1.5 text-xs leading-6 text-muted">{!direction.evidence.length && <li>当前履历未匹配到该方向的能力证据，先核对岗位要求与真实经历，再决定是否重点投入。</li>}{direction.evidence.map((evidence, i) => <li key={i}><span className="font-medium text-foreground">{evidence.skill}：</span>{evidence.quote}</li>)}</ul></article>)}</div> : <EmptyNote>尚无足够履历证据推荐职业方向。请先完善真实履历，再更新分析。</EmptyNote>}
          {Boolean(career?.matched?.length) && <div className="mt-5"><h3 className="mb-3 text-xs font-semibold text-muted">履历中已经找到的优势证据</h3><div className="space-y-3">{career?.matched.slice(0, 4).map((match) => <div key={match.skill} className="flex items-start gap-2 text-xs leading-6"><Check className="mt-1 size-3.5 shrink-0 text-brand" /><div><span className="font-medium">{match.skill}</span><span className="text-muted"> · {match.count} 个岗位涉及</span>{sources(match.jobIds)}<blockquote className="mt-1 border-l-2 border-border pl-3 text-muted">{match.quote}</blockquote></div></div>)}</div></div>}
        </section>
        <section className={sectionClass} id="salary-advice"><SectionHeading icon={<Lightbulb className="size-4 text-brand" />} title="薪资建议">以当前样本分布作为谈薪参考，结合岗位层级、职责范围和案例证据调整。</SectionHeading>{career?.salaryAdvice?.range ? <div className="rounded-xl bg-brand-soft p-5"><p className="text-xs font-medium text-brand-text">可用于讨论的参考月薪带</p><p className="mt-3 text-3xl font-semibold tracking-tight">{salaryK(career.salaryAdvice.range[0])}–{salaryK(career.salaryAdvice.range[1])}<span className="ml-1 text-sm font-normal text-muted">/ 月</span></p><p className="mt-3 text-xs leading-6 text-muted">{career.salaryAdvice.basis}</p>{career.salaryAdvice.stretch !== null && <p className="mt-3 border-t border-brand/15 pt-3 text-xs leading-6">若职责、层级匹配，且能用作品和成果证明独立负责能力，可尝试围绕 {salaryK(career.salaryAdvice.stretch)}/月沟通，并核对薪酬结构。</p>}</div> : <EmptyNote>{career?.salaryAdvice?.basis || "薪资样本不足，暂不生成数字建议。先补齐可读的同方向岗位薪资。"}</EmptyNote>}{Boolean(career?.salaryAdvice?.perRole?.length) && <div className="mt-4 space-y-3">{career?.salaryAdvice.perRole.map((group) => <article key={group.role} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{group.role}</h3><span className="text-sm font-semibold">{group.count < 3 ? "样本不足，暂不定价" : `${salaryK(group.range[0])}–${salaryK(group.range[1])}/月`}</span></div><p className="mt-2 text-xs leading-5 text-muted">依据 {group.count} 个同方向月薪样本 · 置信度{group.confidence === "moderate" ? "中等" : "较低"} · 区间中点的 25%～75% 分位</p>{group.evidenceSkills.length > 0 && <p className="mt-2 text-xs leading-5 text-muted">可准备的能力证据：{group.evidenceSkills.join("、")}</p>}</article>)}</div>}<div className="mt-5 space-y-3 text-xs leading-6"><p><span className="font-medium">先核对口径：</span><span className="text-muted">固定月薪、发薪月数、绩效比例、年终奖条件、试用期、提成和加班安排。</span></p><p><span className="font-medium">再说明依据：</span><span className="text-muted">挑选 2～3 个与岗位要求直接相关的真实案例，用职责、行动与成果解释期望薪资。</span></p><p className="text-muted">建议置信度：{career?.salaryAdvice?.confidence === "moderate" ? "中等" : "较低"}。这里没有推断你的当前薪资、最低可接受薪资或最终到手收入。</p></div></section>
      </div>

      {Boolean(career?.trajectory?.length) && <section className={sectionClass}><SectionHeading icon={<Target className="size-4 text-brand" />} title="职业发展路径">以实际项目和面试反馈检验这条路线，时间仅作为规划窗口。</SectionHeading><div className="grid gap-4 md:grid-cols-3">{career?.trajectory?.map(stage=><article key={stage.period} className="rounded-xl border border-border p-4"><p className="text-xs font-semibold text-brand-text">{stage.period}</p><h3 className="mt-2 text-sm font-semibold">{stage.title}</h3><p className="mt-3 text-xs leading-6 text-muted">{stage.goal}</p></article>)}</div></section>}

      <section className={sectionClass} id="growth-plan"><SectionHeading icon={<TrendingUp className="size-4 text-brand" />} title="提升建议 · 90 天行动">优先补齐高频需求中的证据与作品。履历未提及的技能视为待核实，不直接认定为你不会。</SectionHeading>{Boolean(career?.toVerify?.length) && <div className="mb-5 flex flex-wrap gap-2">{career?.toVerify.slice(0, 8).map((item) => <span key={item.skill} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">待补证据：{item.skill}<span className="ml-1.5 text-muted">{item.count} 个岗位</span>{sources(item.jobIds)}</span>)}</div>}{career?.plan?.length ? <div className="grid gap-4 md:grid-cols-3">{career.plan.map((stage) => <article key={stage.days} className="rounded-xl border border-border p-4"><p className="text-xs font-semibold tracking-wide text-brand-text">{stage.days} 天里程碑</p><h3 className="mt-2 text-sm font-semibold">{stage.title}</h3><ul className="mt-3 space-y-2 text-xs leading-6 text-muted">{stage.actions.map((action, index) => <li key={index} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-brand" /><span>{action}</span></li>)}</ul></article>)}</div> : <EmptyNote>收集岗位并补充履历后，再形成具体的提升计划。</EmptyNote>}<div className="mt-5 flex flex-wrap gap-2"><Link href="/boss-resumes" className={buttonVariants({ variant: "outline", size: "sm" })}>准备岗位专属简历<ArrowRight className="size-3.5" /></Link><Link href="/cv" className={buttonVariants({ variant: "ghost", size: "sm" })}>查看履历依据</Link></div></section>

      <section className={`${sectionClass} overflow-hidden`} id="source-jobs"><SectionHeading icon={<ExternalLink className="size-4 text-brand" />} title="分析来源 · 岗位样本">每条保留原岗位链接，便于核对要求与薪资。点击技能旁的编号可定位到来源岗位；实际状态以 BOSS 页面为准。</SectionHeading><div className="space-y-3">{(showAll ? observations : observations.slice(0, 15)).map((job, index) => { const link = safeBossUrl(job.url); return <article id={`sample-${job.id}`} key={job.id} className="scroll-mt-8 rounded-xl border border-border px-4 py-3.5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-faint">[{index + 1}] {job.company || "公司待核对"} · {job.location || "地点待核对"}</p><h3 className="mt-1.5 break-words text-sm font-semibold">{link ? <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-brand-text">{job.title}<ExternalLink className="size-3 shrink-0" /></a> : job.title}</h3></div><span className="shrink-0 rounded-lg bg-background px-2.5 py-1.5 text-xs font-medium">{job.salaryVerified ? job.salaryText : "薪资未知"}</span></div><p className="mt-2 text-[11px] leading-5 text-muted">{[job.experience, job.education, job.keyword && `关键词：${job.keyword}`, job.capturedAt && `采集：${timestamp(job.capturedAt)}`, job.salaryVerified && job.salarySource && `薪资核验：${job.salarySource}`, job.salaryVerified && job.salaryCapturedAt && `薪资记录：${timestamp(job.salaryCapturedAt)}`].filter(Boolean).join(" · ")}</p></article>; })}</div>{observations.length > 15 && <Button type="button" variant="ghost" className="mt-4 w-full" onClick={() => setShowAll((previous) => !previous)}>{showAll ? "收起样本" : `展开全部 ${observations.length} 个样本`}<ChevronDown className={`size-4 ${showAll ? "rotate-180" : ""}`} /></Button>}</section>
    </>}
  </div>;
}

function Stat({ label, value, unit, description }: { label: string; value: string; unit?: string; description: string }) {
  return <div className="rounded-2xl border border-border bg-surface p-5"><p className="text-xs text-muted">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}{unit && <span className="ml-1.5 text-xs font-normal text-muted">{unit}</span>}</p><p className="mt-2 text-[11px] leading-5 text-faint">{description}</p></div>;
}
function SalaryMetric({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return <div className={`rounded-xl border p-3 text-center ${highlight ? "border-brand/30 bg-brand-soft" : "border-border bg-background"}`}><p className="text-xs text-muted">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums md:text-2xl">{salaryK(value)}</p><p className="mt-1 text-[11px] text-faint">元 / 月</p></div>;
}
