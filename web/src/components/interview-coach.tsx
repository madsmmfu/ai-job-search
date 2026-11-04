"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Download, FileText, LoaderCircle, Mic, Save, Sparkles, Square } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

type Job = { id: string; company: string; title: string; url: string; hasRequirements: boolean };
type Question = { id: string; category: string; question: string; focus: string; evidence: { source: string; quote: string } };
type ResumeDelivery = { status: string; recruiter: string; filename: string; updatedAt: string };
type CoachResume = { status: string; message: string; versions: { id: string; createdAt: string; highlights: string[]; pdfUrl: string; downloadUrl: string; deliveries: ResumeDelivery[] }[] };
type Preparation = { resume: CoachResume; job: Job; companyContext: { status: string; message: string; quotes: string[] }; conversation: { available: boolean; count: number; message: string }; cvEvidence: string[]; questions: Question[]; predictionNote: string };
type Feedback = { quote: string; feedback: string };
type Assessment = { summary: string; contentFeedback: Feedback[]; structure: Feedback[]; evidenceGaps: Feedback[]; exercises: string[] };
type Analysis = { status: string; message: string; assessment: Assessment | null };
const panel = "rounded-2xl border border-border bg-surface p-5 md:p-6";
const field = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand/60 disabled:opacity-60";
async function post(input: unknown) {
  const response = await fetch("/api/boss/interview-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "操作失败，请稍后重试。");
  return data;
}

export function InterviewCoach() {
  const [jobs, setJobs] = useState<Job[]>([]), [jobId, setJobId] = useState("");
  const [preparation, setPreparation] = useState<Preparation | null>(null), [questionId, setQuestionId] = useState("");
  const [transcript, setTranscript] = useState(""), [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [recording, setRecording] = useState(false), [audio, setAudio] = useState<Blob | null>(null), [audioUrl, setAudioUrl] = useState("");
  const [recordingId, setRecordingId] = useState(""), [asrMessage, setAsrMessage] = useState("");
  const [elapsed, setElapsed] = useState(0), [audioSaved, setAudioSaved] = useState(false), [loaded, setLoaded] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), startedAt = useRef(0), stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void fetch("/api/boss/interview-coach", { cache: "no-store" }).then(async response => { const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || "读取岗位失败。"); if (mounted.current) { setJobs(data.jobs || []); setJobId(data.jobs?.find((job: Job) => job.hasRequirements)?.id || data.jobs?.[0]?.id || ""); } }).catch(failure => { if (mounted.current) setError(failure.message); }).finally(() => { if (mounted.current) setLoaded(true); });
    return () => { mounted.current = false; if (stopTimer.current) clearTimeout(stopTimer.current); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  useEffect(() => { if (!audio) { setAudioUrl(""); return; } const url = URL.createObjectURL(audio); setAudioUrl(url); return () => URL.revokeObjectURL(url); }, [audio]);
  useEffect(() => { if (!recording) return; const timer = setInterval(() => setElapsed(Math.round((performance.now() - startedAt.current) / 1000)), 1000); return () => clearInterval(timer); }, [recording]);
  const question = preparation?.questions.find(item => item.id === questionId);
  async function prepare() {
    setBusy("prepare"); setError(""); setNotice(""); setAnalysis(null);
    try { const result = await post({ op: "prepare", jobId }) as Preparation; setPreparation(result); setQuestionId(result.questions[0]?.id || ""); setTranscript(""); setAudio(null); setAudioSaved(false); setRecordingId(""); setAsrMessage(""); setElapsed(0); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "准备失败。"); }
    finally { setBusy(""); }
  }
  async function startRecording() {
    if (busy || recording || !question) return;
    setBusy("microphone"); setError(""); setNotice("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("当前浏览器不支持录音，可填写回答转写稿继续练习。");
      const capture = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { capture.getTracks().forEach(track => track.stop()); return; }
      stream.current = capture;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(value => MediaRecorder.isTypeSupported(value));
      const instance = mime ? new MediaRecorder(capture, { mimeType: mime }) : new MediaRecorder(capture);
      const chunks: Blob[] = [];
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onstop = () => { capture.getTracks().forEach(track => track.stop()); if (stopTimer.current) clearTimeout(stopTimer.current); if (!mounted.current) return; const blob = new Blob(chunks, { type: instance.mimeType || "audio/webm" }); setAudio(blob); setRecording(false); setElapsed(Math.round((performance.now() - startedAt.current) / 1000)); };
      instance.onerror = () => { capture.getTracks().forEach(track => track.stop()); if (mounted.current) { setRecording(false); setError("录音发生错误，请检查麦克风后重试。"); } };
      recorder.current = instance; setAudio(null); setAudioSaved(false); setRecordingId(""); setAsrMessage(""); setElapsed(0); setAnalysis(null); startedAt.current = performance.now(); instance.start(); setRecording(true);
      stopTimer.current = setTimeout(() => { if (instance.state === "recording") instance.stop(); }, 5 * 60 * 1000);
    } catch (failure) { stream.current?.getTracks().forEach(track => track.stop()); setError(failure instanceof Error ? `无法开始录音：${failure.message}` : "无法使用麦克风。"); }
    finally { setBusy(""); }
  }
  async function uploadAudio() {
    if (!audio) throw new Error("请先录制一次回答。");
    if (audio.size > 20 * 1024 * 1024) throw new Error("录音超过 20 MB，请下载后重新录制较短的回答。");
    const form = new FormData(); form.append("audio", audio, `practice.${audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm"}`);
    const response = await fetch("/api/boss/interview-coach", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "保存录音失败。");
    setAudioSaved(true); setRecordingId(data.id);
    return data;
  }
  async function saveAudio() {
    setBusy("audio"); setError("");
    try { const data = await uploadAudio(); setNotice(data.message); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "保存录音失败。"); }
    finally { setBusy(""); }
  }
  async function transcribe() {
    setBusy("transcribe"); setError(""); setAnalysis(null); setAsrMessage("");
    try {
      const id = recordingId || (await uploadAudio()).id;
      const data = await post({ op: "transcribe", recordingId: id });
      setAsrMessage(data.message);
      if (data.status === "ok") setTranscript(data.text || "");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "转写失败。"); }
    finally { setBusy(""); }
  }
  async function assess() {
    if (!question || !transcript.trim()) return;
    setBusy("assess"); setError(""); setAnalysis(null);
    try { setAnalysis(await post({ op: "assess", jobId: preparation?.job.id, questionId, transcript: transcript.trim() })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "分析失败，请稍后重试。"); }
    finally { setBusy(""); }
  }
  return <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 md:px-8">
    <header><div className="mb-3 flex items-center gap-3"><span className="rounded-xl bg-brand-soft p-2.5 text-brand"><Mic className="size-6" /></span><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">岗位面试训练</h1></div><p className="max-w-3xl text-sm leading-6 text-muted">从具体岗位要求和已保存的实际沟通中准备可能的问题。录下自己的回答，结合转写稿复盘内容、结构与证据。</p></header>
    {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm leading-6 text-red-600 dark:text-red-400">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-brand/20 bg-brand-soft p-4 text-sm leading-6">{notice}</p>}
    <section className={panel}><h2 className="mb-4 text-base font-semibold">1. 选择练习岗位</h2><div className="flex flex-col gap-3 sm:flex-row"><label htmlFor="coach-job" className="sr-only">已保存的岗位</label><select id="coach-job" value={jobId} disabled={Boolean(busy) || recording || !jobs.length} onChange={event => setJobId(event.target.value)} className={field}><option value="" disabled>{loaded ? "选择一个已保存岗位" : "正在读取岗位…"}</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.company} · {job.title}{job.hasRequirements ? "" : "（缺少 JD）"}</option>)}</select><Button type="button" className="shrink-0" disabled={!jobId || Boolean(busy) || recording} onClick={() => void prepare()}>{busy === "prepare" ? <LoaderCircle className="size-4 animate-spin" /> : <BookOpen className="size-4" />}准备练习题</Button></div>{loaded && !jobs.length && <p className="mt-3 text-xs leading-6 text-muted">尚无保存的岗位，先在市场分析中采集岗位需求。</p>}</section>
    {preparation && <>
      <section className={panel}><h2 className="text-base font-semibold">{preparation.job.company} · {preparation.job.title}</h2><p className="mt-3 text-xs leading-6 text-muted">{preparation.predictionNote}</p><div className="mt-4 grid gap-4 md:grid-cols-2"><div className="rounded-xl bg-background p-4"><h3 className="text-xs font-semibold">公司业务依据</h3><p className="mt-2 text-xs leading-6 text-muted">{preparation.companyContext.message}</p>{preparation.companyContext.quotes.map((quote, index) => <blockquote key={index} className="mt-2 border-l-2 border-border pl-3 text-xs leading-6">{quote}</blockquote>)}</div><div className="rounded-xl bg-background p-4"><h3 className="text-xs font-semibold">实际沟通依据</h3><p className="mt-2 text-xs leading-6 text-muted">{preparation.conversation.message}</p>{preparation.conversation.available && <p className="mt-2 text-xs text-muted">本次参考 {preparation.conversation.count} 条实际消息。</p>}<Link href="/cv" className={`${buttonVariants({ variant: "ghost", size: "sm" })} mt-3`}><FileText className="size-3.5" />查看履历事实</Link></div></div></section>
      <section className={panel} aria-label="本岗位简历版本"><h2 className="text-base font-semibold">招聘方收到的简历版本</h2><p className={`mt-3 text-xs leading-6 ${preparation.resume.status === "unknown" ? "text-amber-700 dark:text-amber-400" : "text-muted"}`}>{preparation.resume.message}</p><div className="mt-4 space-y-3">{preparation.resume.versions.map(version => <div key={version.id} className="rounded-xl border border-border p-4"><p className="break-all text-xs font-semibold">版本编号：{version.id}</p><p className="mt-2 text-xs text-muted">生成时间：{formatResumeTime(version.createdAt)}</p>{version.deliveries.length ? <ul className="mt-3 space-y-2">{version.deliveries.map((delivery, index) => <li key={index} className="break-words text-xs leading-6"><span className={delivery.status === "sent" ? "font-semibold text-brand-text" : "font-semibold text-amber-700 dark:text-amber-400"}>{delivery.status === "sent" ? "已发送 · 有回执" : delivery.status === "unknown" ? "发送结果待核对" : delivery.status === "uploaded" ? "已上传入库 · 未确认发送" : "未发送"}</span>{delivery.recruiter && ` · 接收人：${delivery.recruiter}`}{delivery.updatedAt && ` · ${formatResumeTime(delivery.updatedAt)}`}{delivery.filename && <span className="block text-muted">附件：{delivery.filename}</span>}</li>)}</ul> : <p className="mt-3 text-xs text-muted">仅已生成 · 无发送回执</p>}{version.highlights.length > 0 && <p className="mt-3 text-xs leading-6 text-muted">本版突出：{version.highlights.join("、")}</p>}<div className="mt-3 flex flex-wrap gap-2"><a href={version.pdfUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}><FileText className="size-3.5" />查看此版 PDF</a><a href={version.downloadUrl} download className={buttonVariants({ variant: "ghost", size: "sm" })}><Download className="size-3.5" />下载此版</a></div></div>)}</div>{!preparation.resume.versions.length && <p className="mt-3 text-xs text-muted">本岗位还没有可核对的定制版本。站外或手动发送的附件未记录，无法判断对方收到哪一版。</p>}<Link href="/boss-resumes" className={`${buttonVariants({ variant: "ghost", size: "sm" })} mt-3`}>管理岗位简历</Link></section>
      <section className={panel}><h2 className="mb-4 text-base font-semibold">2. 选择问题并练习</h2>{preparation.questions.length ? <div className="grid items-start gap-5 lg:grid-cols-[0.8fr_1.4fr]"><div className="space-y-2">{preparation.questions.map((item, index) => <button key={item.id} type="button" disabled={recording || Boolean(busy)} onClick={() => { setQuestionId(item.id); setAnalysis(null); setTranscript(""); setAudio(null); setAudioSaved(false); setRecordingId(""); setAsrMessage(""); setNotice(""); setElapsed(0); }} aria-pressed={questionId === item.id} className={`w-full rounded-xl border p-3 text-left text-sm disabled:opacity-60 ${questionId === item.id ? "border-brand/40 bg-brand-soft text-brand-text" : "border-border hover:bg-surface-hover"}`}>{index + 1}. {item.category}</button>)}</div>{question && <div><h3 className="text-base font-semibold leading-7">{question.question}</h3><blockquote className="mt-4 rounded-xl bg-background p-4 text-xs leading-6"><span className="mb-1 block font-semibold text-muted">依据 · {question.evidence.source}</span>{question.evidence.quote}</blockquote><p className="mt-3 text-xs leading-6 text-muted">练习重点：{question.focus}</p><div className="mt-5 rounded-xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Button type="button" variant={recording ? "outline" : "primary"} disabled={Boolean(busy)} onClick={() => recording ? recorder.current?.stop() : void startRecording()}>{busy === "microphone" ? <LoaderCircle className="size-4 animate-spin" /> : recording ? <Square className="size-4" /> : <Mic className="size-4" />}{recording ? "停止录音" : "开始录音"}</Button><span role="status" className={`text-xs tabular-nums ${recording ? "text-red-600" : "text-muted"}`}>{recording ? "录制中 · " : "录制时长 "}{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span></div><p className="text-xs text-faint">单次最多 5 分钟</p></div>{audioUrl && <div className="mt-4 space-y-3"><audio controls src={audioUrl} className="w-full" /><div className="flex flex-wrap gap-2"><a href={audioUrl} download={`面试练习.${audio?.type.includes("mp4") ? "m4a" : audio?.type.includes("ogg") ? "ogg" : "webm"}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download className="size-3.5" />下载录音</a><Button type="button" variant="ghost" size="sm" disabled={Boolean(busy) || audioSaved} onClick={() => void saveAudio()}>{busy === "audio" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}{audioSaved ? "已私有保存" : "私有保存录音"}</Button><Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => void transcribe()}>{busy === "transcribe" ? <LoaderCircle className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}{busy === "transcribe" ? "本地转写中…" : "本地语音转写"}</Button></div></div>}<p className="mt-3 text-xs leading-6 text-muted">录音可回放、下载或私有保存。点击本地语音转写后，将使用本机 Whisper 生成文字，最长等待约 2 分钟。</p></div></div>}</div> : <p className="text-sm leading-6 text-muted">当前资料不足以生成有依据的练习题，请先补充这个岗位的完整 JD 或实际沟通。</p>}</section>
      {question && <section className={panel}><h2 className="mb-3 text-base font-semibold">3. 根据转写稿分析回答</h2><p className="mb-4 text-xs leading-6 text-muted">可使用上方本地语音转写，也可以填写实际回答或粘贴其他工具的转写稿。分析检查内容、结构和证据，不对声音、性格或情绪作判断。</p>{asrMessage && <p role="status" className="mb-4 rounded-xl bg-brand-soft p-3 text-xs leading-6">{asrMessage}</p>}<label htmlFor="coach-transcript" className="sr-only">本次回答转写稿</label><textarea id="coach-transcript" value={transcript} onChange={event => { setTranscript(event.target.value); setAnalysis(null); }} rows={8} maxLength={12000} disabled={Boolean(busy) || recording} placeholder="粘贴或输入本次回答的真实转写稿…" className={`${field} resize-y leading-7`} /><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-faint">{transcript.length} / 12000 字 · 修改稿件后需要重新分析</p><Button type="button" disabled={Boolean(busy) || recording || !transcript.trim()} onClick={() => void assess()}>{busy === "assess" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{busy === "assess" ? "正在分析回答…" : "AI 分析本次回答"}</Button></div>{analysis && <div className="mt-6 border-t border-border pt-5" aria-live="polite"><p className={`text-xs leading-6 ${analysis.status === "ok" ? "text-muted" : "text-amber-700 dark:text-amber-400"}`}>{analysis.message}</p>{analysis.assessment && <div className="mt-4 space-y-5"><p className="rounded-xl bg-brand-soft p-4 text-sm leading-7">{analysis.assessment.summary}</p><div className="grid items-start gap-4 md:grid-cols-3"><FeedbackGroup title="内容反馈" items={analysis.assessment.contentFeedback} /><FeedbackGroup title="回答结构" items={analysis.assessment.structure} /><FeedbackGroup title="待补充证据" items={analysis.assessment.evidenceGaps} /></div><div><h3 className="mb-3 text-sm font-semibold">下一轮练习</h3><ul className="space-y-2">{analysis.assessment.exercises.map((exercise, index) => <li key={index} className="flex gap-2 text-xs leading-6"><span className="text-brand-text">{index + 1}.</span>{exercise}</li>)}</ul></div></div>}</div>}</section>}
    </>}
  </div>;
}
function FeedbackGroup({ title, items }: { title: string; items: Feedback[] }) {
  return <div className="rounded-xl border border-border p-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{items.length ? <div className="space-y-4">{items.map((item, index) => <div key={index}><blockquote className="border-l-2 border-brand/30 pl-3 text-xs leading-6">{item.quote}</blockquote><p className="mt-2 text-xs leading-6 text-muted">{item.feedback}</p></div>)}</div> : <p className="text-xs leading-6 text-muted">本次没有提供可核对的专项反馈。</p>}</div>;
}

function formatResumeTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "时间未记录" : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }); }
