"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Copy, Download, ExternalLink, FileText, LoaderCircle, MessageSquare, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { resumeUploadFilename } from "@/lib/boss/send-resume.mjs";

type ResumeVersion = {
  id: string;
  company: string;
  title: string;
  url?: string;
  createdAt: string;
  highlights: string[];
  intro: string;
  pdfUrl: string;
  downloadUrl: string;
};
type ChatStatus = { company: string; title: string; resumeRequested: boolean; canSendResume: boolean; message: string };
type SendResult = { status: "sent" | "unknown" | "blocked" | "error"; message: string; filename?: string; recipient?: string };

function bossUrl(value: string | undefined) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && (url.hostname === "zhipin.com" || url.hostname.endsWith(".zhipin.com")) ? url.href : undefined;
  } catch { return undefined; }
}

const fieldClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-faint focus:border-brand/60 disabled:opacity-60";

export function BossResumes() {
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [chat, setChat] = useState<ChatStatus | null>(null);
  const [chatError, setChatError] = useState("");
  const [confirmedVersion, setConfirmedVersion] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sendResults, setSendResults] = useState<Record<string, SendResult>>({});
  const sendLock = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUrl(params.get("url") || "");
    setCompany(params.get("company") || "");
    setTitle(params.get("title") || "");
    let active = true;
    void fetch("/api/boss/resumes", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取简历版本失败，请刷新重试。");
      if (active) { setVersions(data.versions || []); setOriginalUrl(data.originalUrl || null); }
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : "读取简历版本失败。");
    }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!bossUrl(url)) { setError("请填写有效的 BOSS 直聘 HTTPS 岗位链接。"); return; }
    setGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/boss/resumes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), company: company.trim(), title: title.trim(), jd: jd.trim() }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "生成失败，请稍后重试。");
      const version = data as ResumeVersion;
      if (!version.id || !version.pdfUrl || !version.downloadUrl) throw new Error("生成结果缺少 PDF，请重试。");
      setVersions((previous) => [{ ...version, url: version.url || url.trim() }, ...previous.filter((item) => item.id !== version.id)]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "生成失败，请稍后重试。"); }
    finally { setGenerating(false); }
  }

  async function copyIntro(version: ResumeVersion) {
    try { await navigator.clipboard.writeText(version.intro); setCopied(version.id); }
    catch { setError("复制失败，请选中介绍文字手动复制。"); }
  }

  async function checkChat() {
    setConfirmedVersion(null);
    setChecking(true);
    setChat(null);
    setChatError("");
    try {
      const response = await fetch("/api/boss/resume-chat", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "无法检查当前沟通，请先在 Edge 打开对应聊天。");
      setChat(data as ChatStatus);
    } catch (failure) { setChatError(failure instanceof Error ? failure.message : "检查失败，请稍后重试。"); }
    finally { setChecking(false); }
  }

  async function sendResume(version: ResumeVersion) {
    if (sendLock.current || checking || confirmedVersion !== version.id || !chat?.canSendResume
      || chat.company.trim() !== version.company.trim() || chat.title.trim() !== version.title.trim()
      || ["sent", "unknown"].includes(sendResults[version.id]?.status)) return;
    sendLock.current = true;
    setSending(version.id);
    try {
      const response = await fetch("/api/boss/resume-send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: version.id, op: "send" }),
      });
      const data = await response.json();
      const statuses = ["sent", "unknown", "blocked", "error"];
      const result: SendResult = statuses.includes(data.status)
        ? { status: data.status, message: data.message || "请查看 BOSS 当前聊天记录。", filename: data.filename }
        : { status: "unknown", message: "无法确认发送结果，请检查 BOSS 聊天记录，避免重复发送。" };
      setSendResults((previous) => ({ ...previous, [version.id]: result }));
    } catch {
      setSendResults((previous) => ({ ...previous, [version.id]: { status: "unknown", message: "连接中断，发送结果尚未确认，请检查 BOSS 聊天记录，避免重复发送。" } }));
    } finally {
      setConfirmedVersion(null);
      setChat(null);
      setSending(null);
      sendLock.current = false;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-3"><span className="rounded-xl bg-brand-soft p-2.5 text-brand"><FileText className="size-6" /></span><h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">岗位专属简历</h1></div>
          <p className="max-w-2xl text-sm leading-6 text-muted">同一份真实经历，根据每个岗位突出不同重点。对方索要简历时，预览对应版本，核对当前沟通后通过 Edge 发送。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {originalUrl && <a href={originalUrl} download className={buttonVariants({ variant: "outline" })}><Download className="size-4" />下载原始简历</a>}
          <Link href="/explore" className={buttonVariants({ variant: "ghost" })}>返回找工作</Link>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <form onSubmit={(event) => void generate(event)} className="rounded-2xl border border-border bg-surface p-5 md:p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><Sparkles className="size-4 text-brand" />生成一个岗位版本</h2>
            <p className="mt-2 text-xs leading-5 text-muted">以你的原始履历为依据调整介绍与经历重点，不增加未经历的项目或成果。</p>
            <div className="mt-5 space-y-4">
              <div><label htmlFor="resume-url" className="mb-1.5 block text-sm font-medium">BOSS 岗位链接</label><input id="resume-url" type="url" required value={url} disabled={generating} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.zhipin.com/job_detail/…" className={fieldClass} /></div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div><label htmlFor="resume-company" className="mb-1.5 block text-sm font-medium">公司名称</label><input id="resume-company" required maxLength={150} value={company} disabled={generating} onChange={(event) => setCompany(event.target.value)} placeholder="目标公司" className={fieldClass} /></div>
                <div><label htmlFor="resume-title" className="mb-1.5 block text-sm font-medium">岗位名称</label><input id="resume-title" required maxLength={150} value={title} disabled={generating} onChange={(event) => setTitle(event.target.value)} placeholder="目标岗位" className={fieldClass} /></div>
              </div>
              <div><label htmlFor="resume-jd" className="mb-1.5 block text-sm font-medium">岗位职责与要求 <span className="font-normal text-faint">（可选）</span></label><textarea id="resume-jd" rows={8} value={jd} disabled={generating} onChange={(event) => setJd(event.target.value)} placeholder="粘贴岗位详情，用于匹配经历、调整每一段工作的介绍重点。" className={`${fieldClass} resize-y leading-6`} /><p className="mt-1.5 text-xs leading-5 text-muted">留空时使用已保存的岗位详情；没有缓存时会提示你粘贴。</p></div>
            </div>
            <Button type="submit" disabled={generating || !loaded} className="mt-5 w-full">{generating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{generating ? "正在匹配经历并生成 PDF…" : "生成岗位专属简历"}</Button>
            {error && <p role="alert" className="mt-3 text-sm leading-6 text-red-600">{error}</p>}
          </form>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4 text-brand" />对方要简历了？</h2>
            <p className="mt-2 text-xs leading-5 text-muted">在 Edge 打开对应的 BOSS 聊天，再检查当前沟通。只在点击时读取，不会在后台监控。</p>
            <Button type="button" variant="outline" onClick={() => void checkChat()} disabled={checking || Boolean(sending)} className="mt-3">{checking && <LoaderCircle className="size-4 animate-spin" />}检查当前沟通</Button>
            <div aria-live="polite">
              {chatError && <p role="alert" className="mt-3 text-sm text-red-600">{chatError}</p>}
              {chat && <div className="mt-3 rounded-lg bg-background p-3 text-sm leading-6"><p className="font-medium">{[chat.company, chat.title].filter(Boolean).join(" · ") || "当前沟通"}</p><p className="mt-1 font-medium">{chat.resumeRequested ? "已检测到对方索要简历" : "当前可见消息未检测到索要简历"}</p><p className="mt-1 text-muted">{chat.message}</p>{!chat.canSendResume && <p className="mt-1 text-xs text-muted">当前平台尚未开放发简历操作，请以 BOSS 聊天窗口的实际状态为准。</p>}</div>}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">双方回复、平台开放发简历后，检查当前沟通并核对公司、岗位及文件，再点击对应版本的发送按钮。每次点击只向当前匹配的 BOSS 聊天发送所选 PDF。</p>
          </section>
        </div>

        <section aria-label="已生成的简历版本">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-semibold">我的岗位版本</h2><span className="text-xs text-muted">{versions.length} 份已保存</span></div>
          {!loaded ? <div className="flex items-center gap-2 rounded-xl border border-border p-6 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" />正在读取简历版本…</div> : !versions.length ? <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center"><FileText className="mx-auto size-8 text-faint" /><h3 className="mt-4 text-sm font-medium">为下一次沟通准备简历</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted">填写目标岗位并生成，所有版本会保存在这里，方便随时下载。</p></div> : <div className="space-y-4">{versions.map((version) => {
            const jobLink = bossUrl(version.url);
            const matchesChat = Boolean(chat?.company && chat?.title && chat.company.trim() === version.company.trim() && chat.title.trim() === version.title.trim());
            const sendResult = sendResults[version.id];
            const sendDisabled = checking || Boolean(sending) || !matchesChat || !chat?.canSendResume || confirmedVersion !== version.id || sendResult?.status === "sent" || sendResult?.status === "unknown";
            const filename = resumeUploadFilename(version);
            return <article key={version.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="p-5">
                <p className="text-xs font-medium text-brand-text">{version.company}</p><h3 className="mt-1.5 break-words text-lg font-semibold">{version.title}</h3>
                <p className="mt-2 text-xs text-faint">生成于 {new Date(version.createdAt).toLocaleString("zh-CN")}</p>
                {matchesChat && <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-xs leading-5 text-brand-text">{chat?.resumeRequested ? "当前聊天检测到索要简历，可准备此岗位版本。" : "此版本与当前聊天的公司、岗位一致。"}</p>}
                {version.highlights?.length > 0 && <div className="mt-4"><h4 className="text-xs font-semibold text-muted">本版突出重点</h4><ul className="mt-2 space-y-1.5">{version.highlights.map((highlight, index) => <li key={index} className="flex gap-2 text-sm leading-6"><Check className="mt-1 size-3.5 shrink-0 text-brand" /><span>{highlight}</span></li>)}</ul></div>}
                {version.intro && <div className="mt-4 rounded-xl bg-background p-3.5"><div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-muted">岗位沟通介绍</h4><Button type="button" variant="ghost" size="sm" onClick={() => void copyIntro(version)}>{copied === version.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied === version.id ? "已复制" : "复制介绍"}</Button></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{version.intro}</p></div>}
                <div className="mt-4 rounded-xl border border-border p-3.5 text-xs leading-5">
                  <p className="font-medium">接收岗位：{version.company} · {version.title}</p>
                  <p className="mt-1 break-all text-muted">发送文件：{sendResult?.filename || filename}</p>
                  {matchesChat && chat?.canSendResume && sendResult?.status !== "sent" && sendResult?.status !== "unknown" && <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={confirmedVersion === version.id} disabled={Boolean(sending)} onChange={(event) => setConfirmedVersion(event.target.checked ? version.id : null)} className="mt-1" /><span>我已核对当前聊天的公司、完整岗位名称及此版简历。</span></label>}
                  {!matchesChat && <p className="mt-2 text-muted">请先检查当前沟通，公司与完整岗位名称匹配后可发送。</p>}
                  {matchesChat && !chat?.canSendResume && <p className="mt-2 text-muted">平台尚未开放发简历，请在双方回复后重新检查。</p>}
                  {sendResult && <div role="status" className={`mt-3 ${sendResult.status === "sent" ? "text-brand-text" : "text-foreground"}`}><p className="font-medium">{sendResult.status === "sent" ? "已验证发送成功" : sendResult.status === "unknown" ? "发送结果待确认" : "尚未发送"}</p><p>{sendResult.message}</p>{sendResult.status === "unknown" && <p className="mt-1 font-medium">检查 BOSS 记录后再操作，请勿重复发送。</p>}</div>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
                {jobLink && <Button type="button" variant="ghost" size="sm" disabled={generating} onClick={() => { setUrl(jobLink); setCompany(version.company); setTitle(version.title); setJd(""); setError(""); document.getElementById("resume-url")?.focus(); }}>使用此岗位</Button>}
                <a href={version.pdfUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}><FileText className="size-3.5" />预览 PDF</a>
                <a href={version.downloadUrl} download className={buttonVariants({ size: "sm" })}><Download className="size-3.5" />下载此版简历</a>
                <Button type="button" size="sm" disabled={sendDisabled} onClick={() => void sendResume(version)}>{sending === version.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />}{sending === version.id ? "正在发送并验证…" : "通过 Edge 发送此版简历"}</Button>
                {jobLink && <a href={jobLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>前往对应沟通<ExternalLink className="size-3.5" /></a>}
              </div>
            </article>;
          })}</div>}
        </section>
      </div>
    </div>
  );
}
