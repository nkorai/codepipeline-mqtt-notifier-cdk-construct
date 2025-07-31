import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

// Node.js globals
const nodeGlobals = {
  require: "readonly",
  module: "readonly",
  exports: "readonly",
  process: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  Buffer: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
};

export default [
  js.configs.recommended,

  // TypeScript source + tests (Node, Jest, etc)
  {
    files: ["**/*.ts"],
    ignores: ["dist/**", "node_modules/**", "src/lambda/**"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        project: "./tsconfig.eslint.json",
      },
      globals: {
        ...nodeGlobals,
        // Jest globals
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        jest: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "no-unused-vars": "warn",
      "prettier/prettier": "error",
      semi: ["error", "always"],
      quotes: ["error", "double"],
    },
  },

  // Lambda JS files (Node.js only)
  {
    files: ["src/lambda/**/*.js", "src/lambda/**/*.mjs"],
    ignores: ["dist/**", "node_modules/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals,
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "no-unused-vars": "warn",
      "prettier/prettier": "error",
    },
  },

  prettierConfig,
];
