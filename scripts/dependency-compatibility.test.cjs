const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { createRequire } = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

// Resolve the patched package through the real Lighthouse CI dependency path,
// not a separate direct copy that would leave the CLI untested.
const requireFromLhci = createRequire(require.resolve("@lhci/cli/package.json"));
const { loadAndParseRcFile } = requireFromLhci("@lhci/utils/src/lighthouserc.js");

test("Lighthouse CI can still load YAML, JSON and CommonJS configurations", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lhci-config-"));
  try {
    const expected = { ci: { collect: { numberOfRuns: 1 } } };
    const fixtures = {
      "config.yml": "ci:\n  collect:\n    numberOfRuns: 1\n",
      "config.yaml": "ci:\n  collect:\n    numberOfRuns: 1\n",
      "config.json": JSON.stringify(expected),
      "config.cjs": `module.exports = ${JSON.stringify(expected)};`,
    };
    for (const [filename, source] of Object.entries(fixtures)) {
      const target = path.join(root, filename);
      writeFileSync(target, source);
      // Lighthouse returns flattened CLI options, not the raw RC structure.
      assert.deepEqual(loadAndParseRcFile(target), { numberOfRuns: 1 });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Lighthouse YAML loader rejects unsafe JavaScript tags", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lhci-unsafe-config-"));
  try {
    const target = path.join(root, "config.yaml");
    writeFileSync(target, "ci: !!js/function 'function () { return 1; }'\n");
    assert.throws(() => loadAndParseRcFile(target), /unknown tag/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
