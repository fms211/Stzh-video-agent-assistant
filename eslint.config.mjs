import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "dist/**",
    "build/**",
    // Runtime-generated browser evidence and packaged plugin test fixtures are not source.
    "output/**",
    "next-env.d.ts",
    // Repository tooling and generated browser traces are not Web application source.
    ".agents/**",
    ".claude/**",
    ".playwright-cli/**",
    ".codex/**",
    "docs/**",
    // These packages have their own runtime/type/test gates instead of Next.js ESLint rules.
    "server/**",
    "electron/**",
    "Tszh-App/**",
    "rag-service/**",
    "test/**",
    "hello-agents-fms/**",
    "scripts/**",
    "screenshot_all.js",
  ]),
  {
    files: ["shared/studio-context/**/*.cjs"],
    rules: {
      // Shared modules also run in the CommonJS server on Node 20.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      // Existing R3F/canvas and hydration code intentionally initializes refs/state lazily.
      // Keep these visible without making the legacy visual layer block functional releases.
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
    },
  },
]);

export default eslintConfig;
