import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import vitest from "@vitest/eslint-plugin";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    plugins: {
      vitest,
    },
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
    },
  },
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    ".selflify/**",
    "tmp_scaffold/**",
    ".dev/var-www/**",
    ".dev/caddy-data/**",
    ".dev/caddy-config/**",
    "data/**",
    "config/**",
    "logs/**",
    "next-env.d.ts",
  ]),
]);
