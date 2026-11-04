import { createBossWebBridge } from "@/lib/boss/webbridge.mjs";
import { classifyResumeRequest, readCurrentResumeChat } from "@/lib/boss/resume-chat.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bridge = createBossWebBridge();
    const snap = await bridge.command("snapshot");
    if (new URL(snap.url).origin !== "https://www.zhipin.com") throw new Error("请在 Edge 打开 BOSS 直聘的对应沟通窗口。");
    const result = await bridge.command("evaluate", { code: `JSON.stringify((${readCurrentResumeChat.toString()})())` });
    const chat = typeof result.value === "string" ? JSON.parse(result.value) : result.value;
    if (!chat?.company || !chat.title) return Response.json({ error: "请先在 Edge 打开具体岗位的沟通窗口，再检查。" }, { status: 422 });
    return Response.json({ company: chat.company, title: chat.title, resumeRequested: classifyResumeRequest(chat.messages), canSendResume: chat.canSendResume, message: chat.canSendResume ? "可下载对应 PDF，再在当前 BOSS 沟通中选择该文件发送。" : "BOSS 当前暂未开放附件发送，请等待对方回复后再检查。" });
  } catch {
    return Response.json({ error: "无法读取当前 BOSS 沟通，请保持 Edge 和 WebBridge 已连接。" }, { status: 503 });
  }
}
