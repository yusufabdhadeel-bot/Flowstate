import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "postgresql-binaries/**",
      "src/generated/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Type-aware rules require the TypeScript program, so they live in their
    // own block. Type checking is slow, so only the high-value rules are on.
    files: ["src/**/*.ts", "scripts/**/*.ts", "prisma/**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A dropped Promise in a request handler or cron job is a real
      // production failure mode, so this stays an error.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",

      // Express 4 does not await route handlers, so passing an async handler is
      // the standard, supported idiom. The dangerous case is passing an async
      // function where a *void* callback is expected (a floating rejection),
      // which stays enabled.
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],

      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/require-await": "warn",

      // The `no-unsafe-*` family fires heavily on the existing Prisma/JSON
      // code, where most models are declared as `Json` and therefore type as
      // `any`. Fixing that properly means reworking the schema, which is out of
      // scope here, so these are reported as warnings rather than blocking CI.
      // Tighten them once the JSON columns are given real types.
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",

      // Pre-existing debt: unused imports and require() calls already in the
      // codebase. Surfaced as warnings so they are visible without blocking.
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "warn",

      "no-console": "off",
      "no-undef": "off",
    },
  },
  {
    // Test files may need looser typing and do not ship to production.
    files: ["src/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
);
