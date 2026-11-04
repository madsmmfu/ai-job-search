import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyResumeRequest } from "../../src/lib/boss/resume-chat.mjs";
test("detects recruiter resume request, excluding own message", () => {
  assert.equal(classifyResumeRequest([{direction:"incoming",text:"方便发一份附件简历过来吗"}]), true);
  assert.equal(classifyResumeRequest([{direction:"outgoing",text:"我可以发简历"}]), false);
  assert.equal(classifyResumeRequest([{direction:"incoming",text:"暂时不用发简历"}]), false);
  assert.equal(classifyResumeRequest([{direction:"incoming",text:"你好，希望进一步沟通"}]), false);
});
