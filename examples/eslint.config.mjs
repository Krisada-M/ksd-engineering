// Opt-in only: copy/adapt into the repo's existing ESLint configuration.
// Configure TypeScript/React parsers from your repo separately as needed.
import engineeringProxy from "../plugins/engineering-proxy/eslint-rules/index.js";

export default [
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    plugins: { "engineering-proxy": engineeringProxy },
    rules: {
      "engineering-proxy/blank-before-return": "error",
      "engineering-proxy/blank-between-functions": "error",
      "engineering-proxy/prefer-guard-clauses": "warn",
    },
  },
];
