import assert from "node:assert/strict";
import { test } from "node:test";
import { cvReadiness } from "../../src/lib/cv/quality.ts";

test("substantial Chinese CV without spaces is ready when it includes experience", () => {
  const cv = "# 张明\n## 工作经历\n负责企业内部数据平台的开发维护，结合业务需求设计数据处理流程，编写自动化任务，改善团队协作效率，持续整理技术文档并协助同事排查线上问题。参与需求评审与版本发布，推动测试流程完善，确保系统运行稳定可靠。";
  const result = cvReadiness(cv);
  assert.ok(result.words >= 80);
  assert.equal(result.hasExperience, true);
  assert.equal(result.scoreable, true);
  assert.equal(result.hint, undefined);
});

test("short Chinese CV remains advisory and offers a Chinese hint", () => {
  const result = cvReadiness("# 张明\n## 技能\n熟悉数据分析");
  assert.equal(result.hasSkills, true);
  assert.equal(result.scoreable, false);
  assert.match(result.hint, /内容较短/);
});

test("Chinese headings and present date recognize experience and skills", () => {
  for (const heading of ["工作经历", "工作经验", "项目经历"]) {
    assert.equal(cvReadiness(`## ${heading}`).hasExperience, true, heading);
  }
  for (const heading of ["专业技能", "技能"]) {
    assert.equal(cvReadiness(`### ${heading}`).hasSkills, true, heading);
  }
  assert.equal(cvReadiness("2023 — 至今").hasExperience, true);
});

test("mixed Chinese and Latin counts both scripts without double counting Han runs", () => {
  assert.equal(cvReadiness("中文React技能 Python").words, 6);
  assert.equal(cvReadiness("中文").words, 2);
});

test("Latin CV length thresholds and recognized headings retain prior behavior", () => {
  for (const words of [0, 39, 40, 79, 80, 199, 200]) {
    const text = Array(words).fill("engineering").join(" ");
    const result = cvReadiness(text);
    assert.equal(result.words, words);
    assert.equal(result.scoreable, words >= 200);
  }
  const text = `## Experience\n${Array(78).fill("engineering").join(" ")}`;
  const result = cvReadiness(text);
  assert.equal(result.words, 80);
  assert.equal(result.hasExperience, true);
  assert.equal(result.scoreable, true);
  assert.equal(cvReadiness("## Skills").hasSkills, true);
  assert.equal(cvReadiness("2020 - present").hasExperience, true);
});
