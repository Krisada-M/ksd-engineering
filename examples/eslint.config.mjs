// Opt-in only: adapt into the host repository's existing ESLint configuration.
// Supply the host's own parser for TypeScript and JSX.
import engineeringProxy from "omp-engineering-proxy/eslint";

export default [
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    plugins: { "engineering-proxy": engineeringProxy },
    rules: {
      "engineering-proxy/blank-before-return": "error",
      "engineering-proxy/blank-between-functions": "error",
      "engineering-proxy/prefer-guard-clauses": "warn",
    },
  },
];
