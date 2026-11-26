// Optional correctness profile. Compose after the host's own flat config only after review.
// Uses the host's existing typescript-eslint installation and actual tsconfig projects.
import tseslint from "typescript-eslint";

export default [
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: {
      "no-unsafe-finally": "error",
      "require-atomic-updates": "warn",
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    rules: {
      "no-shadow": "error",
      "no-unused-vars": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "no-shadow": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: false }],
      "@typescript-eslint/strict-boolean-expressions": "warn",
    },
  },
];
