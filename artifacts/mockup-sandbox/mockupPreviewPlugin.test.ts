import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ResolvedConfig } from "vite";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

test("discovers nested TSX mockups but excludes private and hidden paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-discovery-"));
  try {
    const files = [
      "Zebra.tsx",
      "nested/Example.tsx",
      "_Private.tsx",
      "_private/Example.tsx",
      "nested/_private/Example.tsx",
      ".hidden/Example.tsx",
      ".Hidden.tsx",
      "Example.ts",
    ];
    for (const file of files) {
      const target = path.join(root, "src/components/mockups", file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "export default function Example() {}");
    }
    const plugin = mockupPreviewPlugin();
    const configResolved = plugin.configResolved;
    assert.equal(typeof configResolved, "function");
    await (configResolved as (config: ResolvedConfig) => void)({ root } as ResolvedConfig);
    assert.equal(typeof plugin.buildStart, "function");
    await (plugin.buildStart as () => Promise<void>)();
    const source = await readFile(path.join(root, "src/.generated/mockup-components.ts"), "utf8");
    assert.match(source, /"\.\/components\/mockups\/Zebra\.tsx"/);
    assert.match(source, /"\.\/components\/mockups\/nested\/Example\.tsx"/);
    assert.match(source, /import\("\.\.\/components\/mockups\/nested\/Example\.tsx"\)/);
    for (const excluded of ["_Private", "_private", ".hidden", ".Hidden", "Example.ts\""]) {
      assert.ok(!source.includes(excluded), `must exclude ${excluded}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generates an empty module when no mockups directory exists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-empty-"));
  try {
    const plugin = mockupPreviewPlugin();
    await (plugin.configResolved as (config: ResolvedConfig) => void)({ root } as ResolvedConfig);
    await (plugin.buildStart as () => Promise<void>)();
    const source = await readFile(path.join(root, "src/.generated/mockup-components.ts"), "utf8");
    assert.match(source, /export const modules: ModuleMap = \{\n\n\};/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
