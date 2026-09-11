import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Privacy guardrail: raw innerHTML is banned by docs/04 §7.
      "react/no-danger": "error",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "next-env.d.ts",
      "public/sw.js",
      "public/sw-manifest.js",
      "scripts/**",
      "supabase/**",
      "docs/**",
      "playwright.config.ts",
    ],
  },
];

export default eslintConfig;
