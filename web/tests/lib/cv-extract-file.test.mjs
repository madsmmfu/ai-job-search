import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { extractCvFile, pdfExecutable } from "../../src/lib/cv/extract-file.mjs";

function fixture(t, name, contents) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cv-extract-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, name);
  fs.writeFileSync(file, contents);
  return file;
}

test("reads UTF-8 Chinese TXT and Markdown without invoking a converter", async (t) => {
  for (const extension of ["txt", "md"]) {
    const file = fixture(t, `简历.${extension}`, "\ufeff  张测试\n软件工程师  \n");
    const result = await extractCvFile(file, { execute: () => assert.fail("must not execute") });
    assert.deepEqual(result, { text: "张测试\n软件工程师", fallbackReason: null });
  }
});

test("rejects empty text, invalid UTF-8, unsupported formats and missing text files", async (t) => {
  await assert.rejects(extractCvFile(fixture(t, "empty.txt", " \n")), /没有文字/);
  await assert.rejects(extractCvFile(fixture(t, "invalid.txt", Buffer.from([0xff]))), /UTF-8/);
  await assert.rejects(extractCvFile("/missing.txt"), /读取失败/);
  await assert.rejects(extractCvFile("/tmp/cv.exe"), /暂不支持/);
});

test("Word conversions pass literal paths to textutil with bounded execution", async () => {
  for (const extension of ["docx", "doc", "rtf"]) {
    const file = `/tmp/简历 $(touch hacked).${extension}`;
    const result = await extractCvFile(file, {
      platform: "darwin",
      execute: async (command, args, options) => {
        assert.equal(command, "/usr/bin/textutil");
        assert.deepEqual(args, ["-convert", "txt", "-stdout", file]);
        assert.equal(options.encoding, "utf8");
        assert.equal(options.timeout, 15_000);
        assert.equal(options.maxBuffer, 2 * 1024 * 1024);
        assert.equal(options.shell, undefined);
        return { stdout: "  测试经历\n" };
      },
    });
    assert.equal(result.text, "测试经历");
  }
});

test("Word failures, timeouts, empty conversion and non-macOS have actionable errors", async () => {
  for (const execute of [async () => { throw new Error("timeout"); }, async () => ({ stdout: "\n" })]) {
    await assert.rejects(extractCvFile("/tmp/cv.docx", { platform: "darwin", execute }), /Word 文件文字提取失败/);
  }
  await assert.rejects(extractCvFile("/tmp/cv.docx", { platform: "linux" }), /另存为 PDF/);
});

test("PDF passes UTF-8 stdout arguments to the discovered converter", async () => {
  const result = await extractCvFile("/tmp/cv.pdf", {
    findPdfExecutable: () => "/opt/homebrew/bin/pdftotext",
    execute: async (command, args, options) => {
      assert.equal(command, "/opt/homebrew/bin/pdftotext");
      assert.deepEqual(args, ["-enc", "UTF-8", "/tmp/cv.pdf", "-"]);
      assert.equal(options.timeout, 15_000);
      return { stdout: "测试简历\f\n" };
    },
  });
  assert.equal(result.text, "测试简历");
});

test("PDF empty, missing converter and conversion failures preserve a clear fallback reason", async () => {
  const empty = await extractCvFile("/tmp/cv.pdf", {
    findPdfExecutable: () => "/converter", execute: async () => ({ stdout: "\f \n" }),
  });
  assert.equal(empty.text, null);
  assert.match(empty.fallbackReason, /OCR/);
  const missing = await extractCvFile("/tmp/cv.pdf", { findPdfExecutable: () => null });
  assert.match(missing.fallbackReason, /pdftotext/);
  const failed = await extractCvFile("/tmp/cv.pdf", {
    findPdfExecutable: () => "/converter", execute: async () => { throw new Error("password required"); },
  });
  assert.match(failed.fallbackReason, /加密/);
});

test("extracts a real synthetic Chinese DOCX through macOS textutil", { skip: process.platform !== "darwin" }, async (t) => {
  const textFile = fixture(t, "synthetic.txt", "张测试\n软件工程师\n测试公司 2024-2026\n");
  const docxFile = path.join(path.dirname(textFile), "synthetic.docx");
  execFileSync("/usr/bin/textutil", ["-convert", "docx", "-output", docxFile, textFile]);
  const result = await extractCvFile(docxFile);
  assert.match(result.text, /张测试/);
  assert.match(result.text, /测试公司 2024-2026/);
});


test("Windows PDF converter uses Path entries, semicolons and .exe without a shell", async () => {
  const installed = String.raw`C:\Program Files\poppler\Library\bin\pdftotext.exe`;
  const visited = [];
  const executable = pdfExecutable({
    platform: "win32", env: { Path: String.raw`relative;C:\Windows;C:\Program Files\poppler\Library\bin` },
    access: candidate => { visited.push(candidate); if (candidate !== installed) throw new Error("missing"); },
  });
  assert.equal(executable, installed);
  assert.deepEqual(visited, [String.raw`C:\Windows\pdftotext.exe`, installed]);
  const file = String.raw`C:\Users\测试\Desktop\简历.pdf`;
  assert.equal((await extractCvFile(file, { platform: "win32", findPdfExecutable: () => executable,
    execute: async (command, args, options) => {
      assert.equal(command, installed); assert.deepEqual(args, ["-enc", "UTF-8", file, "-"]);
      assert.equal(options.shell, undefined); return { stdout: "中文简历" };
    },
  })).text, "中文简历");
});

test("Windows Word conversion clearly requests PDF or UTF-8 rather than invoking macOS tools", async () => {
  await assert.rejects(extractCvFile("cv.docx", { platform: "win32", execute: () => assert.fail("macOS converter must not run") }), /另存为 PDF 或 UTF-8/);
});
