import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, chrome: "readonly" },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Injected as a classic script, so it is plain browser JavaScript.
    files: ["client/public/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, chrome: "readonly" },
    },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.{js,ts}"],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },
);
