// ESLint for the whole workspace: `pnpm lint` (CI runs it on every push).
// Errors fail the check; warnings are reported but don't, so existing code
// can be tidied as it is touched.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/generated/**",
      "**/*.d.ts",
      "**/public/**",
      "**/.lighthouseci/**",
      "**/test-results/**",
      "**/playwright-report/**",
      // Prototyping sandbox.
      "artifacts/mockup-sandbox/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Deliberately empty catches ("best effort") are common and fine.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Tidiness, not bugs: warnings to clear as files are touched.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn",
      "@typescript-eslint/no-unused-expressions": ["error", { allowTernary: true, allowShortCircuit: true }],
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["**/audio-playback-worklet.js"],
    languageOptions: { globals: globals.audioWorklet },
  },
  {
    files: ["artifacts/my-impact/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Hooks called conditionally or in loops break React outright.
      "react-hooks/rules-of-hooks": "error",
      // Effects that miss a dependency use stale values (the journal photo
      // that didn't show was one).
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
