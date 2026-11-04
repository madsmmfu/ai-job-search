"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, CirclePause, Clock3, FileText, LoaderCircle, LogIn, MessageSquare, Play, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type PendingQuestion = { id: string; company: string; title: string; question: string; reason: string; createdAt: string; resolved?: boolean; operatorAnswer?: string };
type AgentEvent = { id: string; company: string; title: string; status: string; message: string; createdAt: string };
type AgentState = {
  candidateName?: string; targetCities?: string[]; targetRoles?: string[]; salaryTarget?: number; startAvailability?: string; interviewPolicy?: string; configuredTransport?: string;
  enabled: boolean;
  loginRequested?: boolean;
  browserMode?: "login" | "headless" | "visible";
  status: "ready" | "running" | "paused" | "login_required" | "blocked" | "error" | "starting";
  lastCheckedAt: string | null;
  transport: string;
  message: string;
  pending: PendingQuestion[];
  events: AgentEvent[];
  counts: { sent: number; pending: number };
  intervalSeconds: number;
  scopes?: { company: string; title: string }[];
};
type Operation = "start" | "finish-login" | "pause" | "login" | "check" | "resolve";

const states = {
  ready: {label:"已登录 · 回复暂停",color:"bg-brand-soft text-brand-text"},
  running: { label: "运行中", color: "bg-brand-soft text-brand-text" },
  paused: { label: "已暂停", color: "bg-background text-muted" },
  login_required: { label: "需要登录", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  blocked: { label: "暂时受阻", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  error: { label: "运行异常", color: "bg-red-500/10 text-red-600 dark:text-red-400" },
  starting: { label: "正在启动", color: "bg-brand-soft text-brand-text" },
};
const eventLabels: Record<string, string> = {
  sent: "已发送", pending: "待你补充", skipped: "已跳过", error: "异常", blocked: "受阻",
  unknown: "结果待核对", checked: "已检查", started: "已启动", paused: "已暂停",
  login_required: "需要登录", resolved: "已提交回答", reply_sent: "已回复", resume_sent: "已发送简历",
};
const panel = "rounded-2xl border border-border bg-surface p-5 md:p-6";
function timestamp(value: string | null) {
  if (!value) return "尚未检查";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function BossAgent() {
  const [state, setState] = useState<AgentState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<Operation | null>(null);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const requestLock = useRef(false);
  const mounted = useRef(false);

  const request = useCallback(async (operation?: Operation, question?: { id: string; answer: string }) => {
    if (requestLock.current) return;
    requestLock.current = true;
    if (operation) { setBusy(operation); setNotice(""); }
    try {
      const response = await fetch("/api/boss/agent", operation ? {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: operation, ...question }),
      } : { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "暂时无法读取助手状态，请稍后刷新。");
      if (!data.status || typeof data.enabled !== "boolean") throw new Error("助手返回的状态不完整，请稍后刷新。");
      if (mounted.current) {
        setState(data as AgentState);
        setError("");
        if (operation === "resolve" && question) {
          setAnswers((previous) => { const next = { ...previous }; delete next[question.id]; return next; });
          setNotice("本次回答已提交。请在沟通记录中核对后续处理与发送结果。");
        }
        if (operation === "login" || operation === "start") setNotice("请在打开的 BOSS 页面完成登录或验证，完成后点击“已登录，转入后台”。登录检查不会启用自动回复。");
      }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "操作失败，请稍后重试。");
    } finally {
      requestLock.current = false;
      if (mounted.current) { setLoaded(true); setBusy(null); setAnswerId(null); }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void request();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void request(); }, 15000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [request]);

  const browserName = state?.configuredTransport === "ego-lite" ? "Ego Lite" : "Edge";
  const status = state ? states[state.status] || states.error : null;
  const pendingQuestions = state?.pending?.filter((question) => !question.resolved) || [];
  return <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-3 flex items-center gap-3"><span className="rounded-xl bg-brand-soft p-2.5 text-brand"><Bot className="size-6" /></span><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">常驻求职助手</h1></div><p className="max-w-2xl text-sm leading-6 text-muted">结合你的真实履历、岗位要求和当前沟通，处理招聘方的新问题。有依据的内容自动回复，缺失的信息留给你补充。</p></div>
      <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void request()}><RefreshCw className="size-4" />刷新状态</Button>
    </header>

    {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm leading-6 text-red-600 dark:text-red-400">{error}{state && <p className="mt-1 text-xs">下方为最近一次读取的状态，当前运行情况暂未确认。</p>}</div>}
    {notice && <p role="status" className="rounded-xl border border-brand/20 bg-brand-soft p-4 text-sm leading-6">{notice}</p>}

    {!loaded ? <div aria-label="正在读取助手状态" className="space-y-6"><Skeleton className="h-48 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div></div> : state && <>
      <section className={panel} aria-label="当前求职资料"><h2 className="font-semibold">{state.candidateName || "尚未设置求职者"}</h2><p className="mt-2 text-sm">{state.targetCities?.join("、")} · {state.targetRoles?.join("、")}</p><p className="mt-2 text-sm">{state.salaryTarget ? `目标月薪 ${state.salaryTarget} 元` : "薪资未确认"} · {state.startAvailability || "到岗时间未确认"}</p><p className="mt-2 text-sm">{state.interviewPolicy || "面试时间需你确认"}</p><p className="mt-2 text-xs text-muted">配置浏览器：{browserName} · 实际连接：{state.transport || "尚未连接"}</p></section>
      <section className={panel} aria-label="助手运行控制"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h2 className="text-base font-semibold">后台运行</h2><span className={`rounded-full px-3 py-1 text-xs font-medium ${status?.color}`}>{status?.label}</span><span className="text-xs text-muted">自动回复{state.enabled ? "已启用" : "未启用"}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">{state.message || "等待助手检查沟通状态。"}</p></div><div className="flex flex-wrap gap-2"><Button type="button" disabled={Boolean(busy) || (state.enabled && ["running", "starting"].includes(state.status))} onClick={() => void request("start")}>{busy === "start" ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}启动助手</Button>{(state.enabled || state.loginRequested) && state.browserMode === "login" && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void request("finish-login")}>已登录，转入后台</Button>}<Button type="button" variant="outline" disabled={Boolean(busy) || (!state.enabled && !state.loginRequested)} onClick={() => void request("pause")}>{busy === "pause" ? <LoaderCircle className="size-4 animate-spin" /> : <CirclePause className="size-4" />}暂停回复</Button></div></div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="flex items-center gap-2 text-xs text-muted"><Clock3 className="size-3.5" />最近检查 {timestamp(state.lastCheckedAt)} · 计划每 {state.intervalSeconds || 120} 秒检查</p><div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => void request("check")}>{busy === "check" ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}立即检查</Button><Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void request("login")}>{busy === "login" ? <LoaderCircle className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />}打开 {browserName} 登录</Button></div></div>
        {(state.enabled || state.loginRequested) && state.browserMode === "login" && state.transport !== "webbridge-edge" && state.configuredTransport !== "ego-lite" && <div className="mt-4 rounded-xl border border-border p-3"><p className="mb-3 text-sm text-muted">若 Edge 窗口未显示，可直接扫描下方登录页面中的二维码。登录后点击“已登录，转入后台”。</p>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/boss/agent/login-preview?t=${encodeURIComponent(state.lastCheckedAt || "")}`} alt="专用 Edge 当前登录页面" className="w-full rounded-lg" /></div>}<p className="mt-3 text-xs leading-6 text-faint">使用配置的 {browserName} 连接 BOSS，实际是否接通以上方连接与运行状态为准。打开登录不会启用自动回复；暂停回复不会关闭页面。</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3"><Metric label="已发送回复" value={state.counts?.sent || 0} description="以助手记录的发送结果为准" /><Metric label="待你补充" value={state.counts?.pending ?? pendingQuestions.length} description="缺少事实或需要你决定的问题" /><div className={panel}><p className="text-xs text-muted">沟通范围</p><p className="mt-3 text-2xl font-semibold">{state.scopes ? `${state.scopes.length} 个岗位` : "已配置的岗位"}</p><p className="mt-2 text-xs leading-5 text-faint">仅处理指定岗位的沟通</p></div></div>

      <section className={panel}><div className="mb-4 flex items-center gap-2"><MessageSquare className="size-4 text-brand" /><h2 className="text-base font-semibold">待你补充</h2></div><p className="mb-5 text-xs leading-6 text-muted">提供这次问题的真实回答，助手会在检查后处理。这里补充的内容仅用于当前问题，不会自动成为你的通用履历。</p>{pendingQuestions.length ? <div className="space-y-4">{pendingQuestions.map((item) => <article key={item.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{item.company}</h3><p className="mt-1 text-xs text-muted">{item.title}</p></div><span className="text-xs text-faint">{timestamp(item.createdAt)}</span></div><blockquote className="mt-4 whitespace-pre-wrap break-words border-l-2 border-brand/30 pl-3 text-sm leading-6">{item.question}</blockquote><p className="mt-3 text-xs leading-6 text-muted">需补充原因：{item.reason}</p>{item.operatorAnswer && <p className="mt-3 rounded-lg bg-brand-soft p-3 text-xs leading-6">你的回答已保存，等待助手处理。<span className="mt-1 block whitespace-pre-wrap break-words">{item.operatorAnswer}</span></p>}<form className="mt-4" onSubmit={(event) => { event.preventDefault(); const answer = (answers[item.id] || "").trim(); if (!answer || busy || item.operatorAnswer) return; setAnswerId(item.id); void request("resolve", { id: item.id, answer }); }}><label className="mb-2 block text-xs font-medium" htmlFor={`answer-${item.id}`}>你对这次问题的回答</label><textarea id={`answer-${item.id}`} value={answers[item.id] || ""} onChange={(event) => setAnswers((previous) => ({ ...previous, [item.id]: event.target.value }))} rows={3} maxLength={1200} required disabled={Boolean(busy) || Boolean(item.operatorAnswer)} placeholder="填写准确的信息或你的决定。" className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-faint focus:border-brand/60 disabled:opacity-60" /><div className="mt-3 flex justify-end"><Button type="submit" size="sm" disabled={Boolean(busy) || Boolean(item.operatorAnswer) || !(answers[item.id] || "").trim()}>{busy === "resolve" && answerId === item.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}提交本次回答</Button></div></form></article>)}</div> : <p className="rounded-xl bg-background p-5 text-sm leading-6 text-muted">暂无待补充的问题。助手发现履历未覆盖的信息时，会在这里列出。</p>}</section>

      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]"><section className={panel}><h2 className="mb-5 text-base font-semibold">最近处理记录</h2>{state.events?.length ? <div className="space-y-3">{state.events.map((event) => <article key={event.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-sm font-medium">{event.company || "助手运行"}</h3>{event.title && <p className="mt-1 text-xs text-muted">{event.title}</p>}</div><span className={`shrink-0 rounded-md px-2 py-1 text-xs ${event.status === "sent" || event.status === "reply_sent" || event.status === "resume_sent" ? "bg-brand-soft text-brand-text" : "bg-background text-muted"}`}>{eventLabels[event.status] || "处理记录"}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted">{event.message}</p><p className="mt-2 text-[11px] text-faint">{timestamp(event.createdAt)}</p></article>)}</div> : <p className="text-sm leading-6 text-muted">尚无处理记录。启动助手后，在这里查看检查、回复与异常结果。</p>}</section>
        <section className={panel}><div className="mb-4 flex items-center gap-2"><ShieldCheck className="size-4 text-brand" /><h2 className="text-base font-semibold">回答依据</h2></div><div className="space-y-4 text-xs leading-6 text-muted"><p><strong className="font-medium text-foreground">用真实经历作答。</strong> 从已保存的履历和个人资料中查找证据，结合该岗位的职责与问题组织回答。行业知识用于解释方法，不会补造个人经历。</p><p><strong className="font-medium text-foreground">关键选择由你补充。</strong> 当前薪资、底线薪资、任职日期、到岗时间及面试安排等未确认事项，进入待补充列表。</p><p><strong className="font-medium text-foreground">跟踪实际处理结果。</strong> 自动回复依赖登录状态、页面可用性和事实完整度；异常、待补充及发送结果可在本页核对。</p></div>{Boolean(state.scopes?.length) && <div className="mt-5 border-t border-border pt-4"><h3 className="mb-3 text-xs font-semibold">当前沟通范围</h3><ul className="space-y-2">{state.scopes?.map((scope, index) => <li key={`${scope.company}-${scope.title}-${index}`} className="text-xs leading-5"><span className="font-medium">{scope.company}</span><span className="text-muted"> · {scope.title}</span></li>)}</ul></div>}<div className="mt-5 flex flex-wrap gap-2"><Link href="/cv" className={buttonVariants({ variant: "outline", size: "sm" })}><FileText className="size-3.5" />查看真实履历</Link><Link href="/boss-resumes" className={buttonVariants({ variant: "ghost", size: "sm" })}>岗位专属简历</Link></div></section></div>
    </>}
  </div>;
}

function Metric({ label, value, description }: { label: string; value: number; description: string }) {
  return <div className={panel}><p className="text-xs text-muted">{label}</p><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-2 text-xs leading-5 text-faint">{description}</p></div>;
}
