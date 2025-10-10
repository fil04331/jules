// eslint.config.js
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const typescriptParser = require("@typescript-eslint/parser");
const nextPlugin = require("next/babel");

module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": typescriptEslint,
      "next": nextPlugin
    },
    languageOptions: {
      parser: typescriptParser,
    },
    rules: {
      ...typescriptEslint.configs.recommended.rules,
      // Add any custom rules here
    },
  },
];
