import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectDeterministicCodeIssues,
  extractTechnicalCodeBlocks,
} from "./technical-code-quality.ts";

Deno.test("structured fenced code is extracted exactly once", () => {
  const fence = "\x60\x60\x60";
  const content = [
    "[CODE_BLOCK]",
    "language: python",
    "code:",
    fence + "python",
    'print("hello")',
    fence,
    "output:",
    "hello",
    "[/CODE_BLOCK]",
  ].join("\n");

  const blocks = extractTechnicalCodeBlocks(content);
  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].language, "python");
  assertEquals(blocks[0].code, 'print("hello")');
});

Deno.test("mixed structured and plain fences preserve manuscript order", () => {
  const fence = "\x60\x60\x60";
  const content = [
    fence + "javascript",
    'console.log("a")',
    fence,
    "",
    "[CODE_BLOCK]",
    "language: python",
    "code:",
    fence + "python",
    'print("b")',
    fence,
    "[/CODE_BLOCK]",
  ].join("\n");

  const blocks = extractTechnicalCodeBlocks(content);
  assertEquals(blocks.map((b) => b.language), ["javascript", "python"]);
  assertEquals(blocks.map((b) => b.index), [0, 1]);
});

Deno.test("deterministic validator blocks known generated Python corruption", () => {
  const fence = "\x60\x60\x60";
  const content = [
    fence + "python",
    "from sklearn.modelselection import traintest_split",
    "1. Generate data",
    "y = 2  X + 1",
    "if name == 'main':",
    "    print(y)",
    fence,
  ].join("\n");

  const codes = detectDeterministicCodeIssues(content).map((issue) => issue.code);
  assertEquals(codes.includes("python_uncommented_step"), true);
  assertEquals(codes.includes("python_main_guard_corrupted"), true);
  assertEquals(codes.includes("python_api_identifier_mangled"), true);
  assertEquals(codes.includes("python_operator_missing"), true);
});
