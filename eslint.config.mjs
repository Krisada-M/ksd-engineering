// Dogfood: this repository must pass the same style rules it ships.
import tseslint from "typescript-eslint";
import engineeringProxy from "./plugins/engineering-proxy/eslint-rules/index.js";

const rules = {
  "engineering-proxy/blank-before-return": "error",
  "engineering-proxy/blank-between-functions": "error",
  "engineering-proxy/prefer-guard-clauses": "warn",
};

export default [
  { ignores: ["plugins/engineering-proxy/dist/**", "node_modules/**", "graft/**", ".gitnexus/**", ".codegraph/**", ".omp/**", ".claude/**", "plugins/engineering-proxy/test/eval/fixtures/**"] },
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    plugins: { "engineering-proxy": engineeringProxy },
    rules,
  },
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "engineering-proxy": engineeringProxy },
    rules,
  },
];
