/**
 * What to tell the person when `/api/cv/ingest` answers with an error instead of
 * a marker stream. The route refuses some requests on purpose with a JSON
 * `{ error }` (e.g. a PDF upload on a CLI that cannot read files, #5369); that
 * body is not a stream, so reading it as one only ever yields the generic
 * "couldn't read a CV" and hides the reason. Returns null for an OK response and
 * leaves its body unread for the stream reader.
 *
 * @param {Response} r
 * @returns {Promise<string | null>}
 */
export async function ingestErrorMessage(r) {
  if (r.ok) return null;
  if (r.status === 404) return "请先在设置中连接 AI CLI，由你配置的 AI 工具解析简历。";
  const body = await r.json().catch(() => null);
  const reason = typeof body?.error === "string" ? body.error.trim() : "";
  return reason || `无法读取简历（错误 ${r.status}），请直接粘贴简历文本。`;
}
