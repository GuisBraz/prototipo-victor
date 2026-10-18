import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "functions/bundle/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.log",
      "firebase/tests/**/*.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Regra do projeto: evitar `any` sem justificativa (docs/ARCHITECTURE.md, regras de engenharia).
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  {
    // Scripts de build executados direto pelo Node.
    files: ["**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}", "apps/site/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
