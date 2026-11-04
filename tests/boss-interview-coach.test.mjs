import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildCoachPreparation, listCoachJobs, prepareCoach, assessCoach, validateCoachAssessment, transcribeCoach, whisperRuntime } from '../boss-interview-coach.mjs';
const job = { id: 'abcdefgh', company: '公司甲', title: '内容运营', url: 'https://www.zhipin.com/job_detail/abcdefgh.html', requirements: '负责 AI 内容生产与流程，面向全球电商客户。\n使用数据衡量内容增长。' };
async function fixture(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coach-test-')); t.after(() => fs.rm(root, { recursive: true, force: true })); await fs.mkdir(path.join(root, 'data/boss-agent-conversations'), { recursive: true }); await fs.writeFile(path.join(root, 'data/boss-market.json'), JSON.stringify({ observations: [job] })); await fs.writeFile(path.join(root, 'cv.md'), '负责内容团队与海外矩阵。'); return root; }
const response = { summary: '回答已有行动描述，还需补充结果。', contentFeedback: [{ quote: '我负责内容', feedback: '补充具体受众和内容选择。' }], structure: [], evidenceGaps: [], exercises: ['按背景、行动、结果重述一次。'] };
test('questions have exact JD evidence; company context is JD-only and no fabricated chats', () => { const result = buildCoachPreparation(job, '内容团队', []); assert.ok(result.questions.length); for (const question of result.questions) assert.ok(job.requirements.includes(question.evidence.quote)); assert.equal(result.companyContext.status, 'jd_only'); assert.equal(result.conversation.available, false); });
test('unknown company/business remains unknown and no fabricated role questions', () => { const result = buildCoachPreparation({ ...job, requirements: '' }); assert.equal(result.companyContext.status, 'unknown'); assert.deepEqual(result.questions, []); });
test('only exact company, title and job URL may contribute actual chats', async t => { const root = await fixture(t); const dir = path.join(root, 'data/boss-agent-conversations'); await fs.writeFile(path.join(dir, 'wrong.json'), JSON.stringify({ ...job, company: '公司乙', messages: [{ direction: 'incoming', text: '他人的聊天' }] })); assert.equal((await prepareCoach(job.id, root)).conversation.available, false); await fs.writeFile(path.join(dir, 'correct.json'), JSON.stringify({ ...job, messages: [{ id: 'm1', direction: 'incoming', text: '可以说明一个 AI 内容案例吗？' }] })); const result = await prepareCoach(job.id, root); assert.equal(result.conversation.available, true); assert.ok(result.questions.some(q => q.evidence.source === '实际聊天')); });
test('reject arbitrary path/job identities and foreign URLs', async t => { const root = await fixture(t); await assert.rejects(prepareCoach('../cv.md', root), /编号无效/); await assert.rejects(prepareCoach('unknownjob', root), /岗位列表/); await fs.writeFile(path.join(root, 'data/boss-market.json'), JSON.stringify({ observations: [{ ...job, url: 'https://evil.example/job_detail/abcdefgh.html' }] })); assert.deepEqual(await listCoachJobs(root), []); });
test('assessment accepts only verbatim transcript quotes and no unverified scores/acoustics', () => { assert.equal(validateCoachAssessment(response, '我负责内容生产。').summary, response.summary); assert.throws(() => validateCoachAssessment(response, '不含引文'), /引用/); assert.throws(() => validateCoachAssessment({ ...response, score: 95 }, '我负责内容'), /字段/); assert.throws(() => validateCoachAssessment({ ...response, summary: '你的语速很快' }, '我负责内容'), /未经音频/); });
test('model failure remains unavailable without fake assessment', async t => { const root = await fixture(t); const result = await assessCoach({ jobId: job.id, questionId: 'jd-0', transcript: '我负责内容生产。' }, root, async () => { throw new Error('offline'); }); assert.equal(result.status, 'model_unavailable'); assert.equal(result.assessment, null); });
test('functional model assessment and selected question validation', async t => { const root = await fixture(t); const input = { jobId: job.id, questionId: 'jd-0', transcript: '我负责内容生产。' }; const result = await assessCoach(input, root, async prompt => { assert.ok(prompt.includes(job.company)); return JSON.stringify(response); }); assert.equal(result.status, 'ok'); assert.equal(result.basis, 'transcript_only'); await assert.rejects(assessCoach({ ...input, questionId: 'fake' }, root, async () => ''), /练习题/); });

test('ASR rejects arbitrary paths and symlink recordings before calling a decoder', async t => {
  const root = await fixture(t), directory = path.join(root, 'data/interview-coach-recordings');
  await fs.mkdir(directory);
  await assert.rejects(transcribeCoach('../cv.md', root), /编号无效/);
  const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa.wav';
  await fs.symlink(path.join(root, 'cv.md'), path.join(directory, id));
  await assert.rejects(transcribeCoach(id, root), /文件无效/);
});
test('invalid model output does not become deterministic pretend analysis', async t => {
  const root = await fixture(t);
  const result = await assessCoach({ jobId: job.id, questionId: 'jd-0', transcript: '我负责内容生产。' }, root, async () => JSON.stringify({ ...response, contentFeedback: [{ quote: '虚构原文', feedback: '改进' }] }));
  assert.equal(result.status, 'model_unavailable'); assert.equal(result.assessment, null);
});

async function resumeFixture(root, suffix, overrides = {}) {
  const id = `aaaaaaaaaaaaaaaa-aaaaaaaa-aaaa-4aaa-aaaa-${suffix.padStart(12, '0')}`;
  const directory = path.join(root, 'output/boss-resumes', id);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'metadata.json'), JSON.stringify({ ...job, id, createdAt: '2026-10-18T00:00:00.000Z', highlights: ['海外内容'], ...overrides }));
  await fs.writeFile(path.join(directory, 'resume.pdf'), '%PDF-test');
  return id;
}
async function sendFixture(root, key, versionId, status, recipient = { company: job.company, title: job.title, recruiter: '王女士' }) {
  const directory = path.join(root, 'data/boss-resume-sends'); await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, key.repeat(64) + '.json'), JSON.stringify({ versionId, status, recipient, filename: '岗位版本.pdf', updatedAt: '2026-10-18T01:00:00.000Z' }));
}
test('generated and uploaded resumes never become sent, links identify the exact version', async t => {
  const root = await fixture(t), id = await resumeFixture(root, '1');
  let result = (await prepareCoach(job.id, root)).resume;
  assert.equal(result.status, 'not_sent'); assert.equal(result.versions[0].id, id); assert.deepEqual(result.versions[0].deliveries, []);
  assert.equal(result.versions[0].downloadUrl, `/api/boss/resumes/${id}?download=1`);
  await sendFixture(root, 'a', id, 'uploaded');
  result = (await prepareCoach(job.id, root)).resume;
  assert.equal(result.status, 'not_sent'); assert.equal(result.versions[0].deliveries[0].status, 'uploaded');
});
test('sent receipt stays attached to the actual old version rather than newer generated PDF', async t => {
  const root = await fixture(t), sentId = await resumeFixture(root, '1'), newerId = await resumeFixture(root, '2', { createdAt: '2026-10-18T02:00:00.000Z' });
  await sendFixture(root, 'a', sentId, 'sent');
  const result = (await prepareCoach(job.id, root)).resume;
  assert.equal(result.status, 'sent'); assert.equal(result.versions[0].id, newerId); assert.deepEqual(result.versions[0].deliveries, []);
  const sent = result.versions.find(version => version.id === sentId);
  assert.equal(sent.deliveries[0].status, 'sent'); assert.equal(sent.deliveries[0].recruiter, '王女士');
});
test('unknown or interrupted sending remains uncertain; wrong recipient and same company different job are excluded', async t => {
  const root = await fixture(t), id = await resumeFixture(root, '1');
  const otherId = await resumeFixture(root, '2', { url: 'https://www.zhipin.com/job_detail/otherjob.html' });
  await sendFixture(root, 'a', otherId, 'sent');
  await sendFixture(root, 'b', id, 'sent', { company: '其他公司', title: job.title, recruiter: '李女士' });
  assert.equal((await prepareCoach(job.id, root)).resume.status, 'not_sent');
  for (const status of ['unknown', 'sending']) {
    await sendFixture(root, 'c', id, status);
    const result = (await prepareCoach(job.id, root)).resume;
    assert.equal(result.status, 'unknown'); assert.equal(result.versions.length, 1); assert.equal(result.versions[0].deliveries[0].status, 'unknown');
  }
});
test('malformed or symbolic-link send ledger is reported as uncertain, never read as a receipt', async t => {
  const root = await fixture(t); await resumeFixture(root, '1');
  const directory = path.join(root, 'data/boss-resume-sends'); await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'a'.repeat(64) + '.json'), '{broken');
  assert.equal((await prepareCoach(job.id, root)).resume.status, 'unknown');
  await fs.rm(directory, { recursive: true }); await fs.symlink(path.join(root, 'output'), directory);
  assert.equal((await prepareCoach(job.id, root)).resume.status, 'unknown');
});


test('Windows Whisper discovers .exe on Path and preserves the Windows environment', async t => {
  const root = await fixture(t), directory = path.join(root, 'data/interview-coach-recordings');
  await fs.mkdir(directory);
  const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa.wav';
  await fs.writeFile(path.join(directory, id), 'synthetic recording');
  await fs.mkdir(path.join(root, '.cache/whisper'), { recursive: true });
  await fs.writeFile(path.join(root, '.cache/whisper/base.pt'), 'synthetic model');
  const env = { Path: String.raw`C:\Python\Scripts;C:\ffmpeg\bin`, TEMP: 'C:\Temp' };
  const result = await transcribeCoach(id, root, { platform: 'win32', home: root, env,
    execute: async (command, args, options) => {
      assert.equal(command, 'whisper.exe'); assert.deepEqual(options.env, env);
      assert.equal(options.shell, undefined); assert.equal(options.timeout, 120000);
      assert.equal(args[0], path.join(directory, id));
      const output = args[args.indexOf('--output_dir') + 1];
      await fs.writeFile(path.join(output, path.parse(id).name + '.json'), JSON.stringify({ text: '我负责内容生产。', segments: [] }));
    },
  });
  assert.equal(result.status, 'ok'); assert.equal(result.text, '我负责内容生产。');
  assert.deepEqual(await fs.readdir(directory), [id]);
});

test('Whisper honors configured executable and does not introduce undefined PATH entries', async () => {
  const env = { CAREER_OPS_WHISPER_PATH: String.raw`D:\AI Tools\whisper.exe`, Path: 'C:\Python' };
  const windows = await whisperRuntime({ platform: 'win32', env });
  assert.equal(windows.executable, env.CAREER_OPS_WHISPER_PATH); assert.deepEqual(windows.env, env);
  const unix = await whisperRuntime({ platform: 'linux', env: { CAREER_OPS_WHISPER_PATH: '/custom/whisper' } });
  assert.equal(unix.env.PATH, '/opt/homebrew/bin');
});
