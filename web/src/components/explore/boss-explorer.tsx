"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, BriefcaseBusiness, Building2, Check, ExternalLink, LoaderCircle, MapPin, Plus, Search, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cleanChips } from "@/lib/explore";
import { cn } from "@/lib/cn";

type BossStatus = "ok" | "login_required" | "blocked" | "error" | "disconnected";
type BossOffer = { url: string; title: string; company: string; location: string; salary?: string; experience?: string; education?: string };
type BossResponse = { status: BossStatus; message: string; offers?: BossOffer[]; searchUrl?: string };

const CITIES = [
  ["100010000", "全国"], ["101010100", "北京"], ["101020100", "上海"],
  ["101280100", "广州"], ["101280600", "深圳"], ["101210100", "杭州"],
  ["101270100", "成都"], ["101190100", "南京"], ["101200100", "武汉"],
  ["101110100", "西安"], ["101030100", "天津"], ["101040100", "重庆"],
  ["101190400", "苏州"], ["101230200", "厦门"], ["101250100", "长沙"],
];

function bossLink(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "zhipin.com" || url.hostname.endsWith(".zhipin.com")) ? url.href : undefined;
  } catch { return undefined; }
}

export function BossExplorer({ seedKeywords }: { seedKeywords: string[] }) {
  const [keywords, setKeywords] = useState(seedKeywords);
  const [draft, setDraft] = useState("");
  const [city, setCity] = useState("101210100");
  const [session, setSession] = useState<BossResponse>({ status: "disconnected", message: "尚未连接 Boss 直聘" });
  const [result, setResult] = useState<BossResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("q")) setKeywords(cleanChips((params.get("q") || "").split(/[,，;；\n]+/)));
    const initialCity = params.get("city");
    if (initialCity && CITIES.some(([code]) => code === initialCity)) setCity(initialCity);
    let active = true;
    void fetch("/api/boss/session")
      .then(async (response) => { const data = await response.json() as BossResponse; if (active) setSession(data); })
      .catch(() => { if (active) setSession({ status: "error", message: "暂时无法读取连接状态，请重试。" }); });
    return () => { active = false; };
  }, []);

  async function connect() {
    setConnecting(true);
    try {
      const response = await fetch("/api/boss/session", { method: "POST" });
      setSession(await response.json() as BossResponse);
    } catch { setSession({ status: "error", message: "打开登录窗口失败，请重试。" }); }
    finally { setConnecting(false); }
  }

  async function checkSession() {
    setChecking(true);
    try { const response = await fetch("/api/boss/session"); setSession(await response.json() as BossResponse); }
    catch { setSession({ status: "error", message: "检查登录状态失败，请重试。" }); }
    finally { setChecking(false); }
  }

  const commit = () => {
    const next = cleanChips([...keywords, ...draft.split(/[,，;；\n]+/)]);
    setKeywords(next);
    setDraft("");
    return next;
  };

  async function search(event: FormEvent) {
    event.preventDefault();
    const query = commit();
    if (!query.length) return;
    const params = new URLSearchParams();
    params.set("q", query.join(","));
    params.set("city", city);
    window.history.replaceState(null, "", `/explore?${params}`);
    setRunning(true);
    setResult(null);
    setSaveError("");
    try {
      const response = await fetch("/api/boss/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: query, city }),
      });
      const data = await response.json() as BossResponse;
      setResult(data);
      if (data.status !== "ok") setSession({ status: data.status, message: data.message });
    } catch { setResult({ status: "error", message: "搜索请求失败，请检查本地服务后重试。", offers: [] }); }
    finally { setRunning(false); }
  }

  async function saveOffer(offer: BossOffer) {
    setAdding(offer.url);
    setSaveError("");
    try {
      const response = await fetch("/api/explore/add", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offers: [{ ...offer, postedAt: "", ats: "boss", source: "Boss 直聘", note: [offer.salary, offer.experience, offer.education].filter(Boolean).join(" · ") }] }),
      });
      const data = await response.json() as { added: number; error?: string };
      if (!response.ok || data.error || !data.added) throw new Error(data.error || "保存岗位失败，请重试。");
      setAdded((previous) => new Set([...previous, offer.url]));
    } catch (error) { setSaveError(error instanceof Error ? error.message : "保存岗位失败，请重试。"); }
    finally { setAdding(null); }
  }

  const offers = (result?.offers || []).filter((offer) => bossLink(offer.url));
  const searchUrl = bossLink(result?.searchUrl);
  const isConnected = session.status === "ok";

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <header className="mb-7">
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-xl bg-brand-soft p-2.5 text-brand"><BriefcaseBusiness className="size-6" /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Boss 找工作</h1>
          <span className="rounded-full border border-brand/25 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-text">专属来源</span>
        </div>
        <p className="text-sm leading-6 text-muted">只在 Boss 直聘查找岗位。按你的求职方向逐个搜索，把感兴趣的岗位加入待评估。</p>
      </header>

      <section aria-label="Boss 直聘连接" className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className={cn("size-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-amber-500")} />
            {isConnected ? "Boss 直聘已连接" : session.status === "login_required" ? "需要登录 Boss 直聘" : "尚未连接 Boss 直聘"}
          </div>
          <p aria-live="polite" className="mt-1.5 text-xs leading-5 text-muted">{session.message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void connect()} disabled={connecting || running}>
            {connecting && <LoaderCircle className="size-4 animate-spin" />}连接 / 登录 Boss 直聘
          </Button>
          <Button type="button" variant="ghost" onClick={() => void checkSession()} disabled={checking || connecting || running}>
            {checking && <LoaderCircle className="size-4 animate-spin" />}检查登录状态
          </Button>
        </div>
      </section>

      <form onSubmit={(event) => void search(event)} className="rounded-xl border border-border bg-surface p-5 md:p-6">
        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="boss-keywords">目标岗位 / 关键词</label>
        <div className="flex min-h-14 flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2.5 focus-within:border-brand/50">
          {keywords.map((keyword) => (
            <span key={keyword} className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft py-1 pl-3 pr-1.5 text-sm text-brand-text">
              {keyword}<button type="button" className="rounded-full p-1 hover:bg-brand/10 disabled:opacity-50" aria-label={`移除 ${keyword}`} disabled={running} onClick={() => setKeywords(keywords.filter((value) => value !== keyword))}><X className="size-3.5" /></button>
            </span>
          ))}
          <input id="boss-keywords" value={draft} disabled={running} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim() && !event.nativeEvent.isComposing) { event.preventDefault(); commit(); }
          }} placeholder="输入关键词，回车添加" className="min-w-44 flex-1 bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-faint" />
        </div>
        <p className="mt-2 text-xs text-faint">多个关键词用逗号分隔，每个方向分别搜索。</p>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="w-full sm:w-48">
            <label htmlFor="boss-city" className="mb-2 block text-sm font-medium text-foreground">工作城市</label>
            <select id="boss-city" value={city} onChange={(event) => setCity(event.target.value)} disabled={running} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground">
              {CITIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
          <Button type="submit" disabled={running || connecting || (!keywords.length && !draft.trim())} className="h-10 w-full sm:w-auto">
            {running ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
            {running ? "正在 Boss 直聘查找…" : "只在 Boss 直聘搜索"}
          </Button>
        </div>
      </form>

      <div aria-live="polite" className="mt-6">
        {running && <div className="flex items-center gap-3 rounded-xl border border-border p-5 text-sm text-muted"><LoaderCircle className="size-5 animate-spin text-brand" />正在读取 Boss 直聘岗位，请稍候…</div>}
        {result && (
          <div className={cn("mb-4 flex items-start gap-3 rounded-xl border p-4 text-sm", result.status === "ok" ? "border-border bg-surface text-muted" : "border-amber-500/25 bg-amber-500/5 text-foreground")}>
            {result.status !== "ok" && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />}
            <div><p>{result.message}</p>{result.status !== "ok" && offers.length > 0 && <p className="mt-1 text-xs text-muted">下方展示已读取的部分岗位，本次搜索尚未完整完成。</p>}</div>
          </div>
        )}
        {saveError && <p role="alert" className="mb-4 text-sm text-red-600">{saveError}</p>}
        {offers.length > 0 && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-foreground">找到 {offers.length} 个岗位</h2><span className="text-xs text-muted">来源：Boss 直聘</span></div>
            <div className="space-y-3">{offers.map((offer) => (
              <article key={offer.url} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="text-base font-semibold text-foreground">{offer.title}</h3>{offer.salary && <p className="text-base font-semibold text-brand-text">{offer.salary}</p>}</div>
                <p className="mt-2 flex items-center gap-2 text-sm text-muted"><Building2 className="size-3.5" />{offer.company}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">{offer.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{offer.location}</span>}{offer.experience && <span>{offer.experience}</span>}{offer.education && <span>{offer.education}</span>}</div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Link href={`/boss-resumes?${new URLSearchParams({ url: offer.url, company: offer.company, title: offer.title })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>生成专属简历</Link>
                  <Button type="button" variant="outline" size="sm" disabled={adding !== null || added.has(offer.url)} onClick={() => void saveOffer(offer)}>
                    {added.has(offer.url) ? <Check className="size-3.5" /> : adding === offer.url ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}{added.has(offer.url) ? "已加入待评估" : "加入待评估"}
                  </Button>
                  <a href={bossLink(offer.url)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })}>查看岗位<ExternalLink className="size-3.5" /></a>
                </div>
              </article>
            ))}</div>
          </>
        )}
        {!running && offers.length === 0 && (!result || result.status === "ok") && (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <Search className="mx-auto mb-3 size-7 text-faint" /><h2 className="text-sm font-medium text-foreground">{result ? "本次没有读取到匹配岗位" : "从你的求职方向开始"}</h2>
            <p className="mt-2 text-sm text-muted">{result ? "试试更短的关键词，或调整工作城市后重新搜索。" : "确认关键词和城市，然后点击搜索。首次使用需要登录 Boss 直聘。"}</p>
          </div>
        )}
        {searchUrl && <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand-text hover:underline">在 Boss 直聘查看本次搜索<ExternalLink className="size-3.5" /></a>}
      </div>
    </div>
  );
}
