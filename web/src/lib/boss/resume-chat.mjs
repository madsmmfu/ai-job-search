// Only recruiter-authored text from the selected conversation is classified.
export function classifyResumeRequest(messages) {
  const latest = messages.filter((m) => m.direction === "incoming" && typeof m.text === "string").slice(-5);
  return latest.some(({ text }) => !/不(?:用|需要|必).{0,6}(?:发|提供|简历)/.test(text) && /(?:发|提供|给|传).{0,15}(?:附件|简历)|(?:附件|简历).{0,15}(?:发|提供|看一下)|求简历/.test(text));
}

export function readCurrentResumeChat() {
  if (location.origin !== "https://www.zhipin.com" || location.pathname !== "/web/geek/chat") return null;
  const root = document.querySelector(".chat-conversation");
  if (!root) return null;
  const info = root.querySelector(".base-info");
  const company = [...(info?.children || [])].find((e) => e.tagName === "SPAN" && !e.className)?.textContent?.trim() || "";
  const control = [...root.querySelectorAll(".toolbar-btn")].find((e) => e.textContent.trim() === "发简历");
  return {
    company,
    recruiter: root.querySelector(".base-info .name-text")?.textContent?.trim() || "",
    title: root.querySelector(".position-name")?.textContent?.trim() || "",
    canSendResume: !!control && !control.classList.contains("unable"),
    messages: [...root.querySelectorAll(".chat-record .message-item.item-friend .text-content")].map((e) => ({ direction: "incoming", text: (e.textContent || "").slice(0, 1500) })),
  };
}
