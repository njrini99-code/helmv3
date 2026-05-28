import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

// W0 (2026-05-28) — six custom rules that enforce the canonical design
// token system from src/styles/tokens.css. See
// docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md §5.
// Each rule allowlists src/components/ui/ (the canonical primitives),
// src/mockups/ (sandbox), the lint-rule directory, and tailwind.config.ts.
import noRawButton from "./eslint-rules/no-raw-button.mjs";
import noRawInput from "./eslint-rules/no-raw-input.mjs";
import noArbitraryTextPx from "./eslint-rules/no-arbitrary-text-px.mjs";
import noBannedColor from "./eslint-rules/no-banned-color.mjs";
import noArbitraryRadius from "./eslint-rules/no-arbitrary-radius.mjs";
import noArbitraryBgWhite from "./eslint-rules/no-arbitrary-bg-white.mjs";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "next-shadcn-dashboard-starter/**",
      "node_modules/**",
      ".next/**",
      "eslint-rules/**",
    ],
  },
  {
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      // Local plugin namespace for the W0 design-system rules.
      "helm": {
        rules: {
          "no-raw-button": noRawButton,
          "no-raw-input": noRawInput,
          "no-arbitrary-text-px": noArbitraryTextPx,
          "no-banned-color": noBannedColor,
          "no-arbitrary-radius": noArbitraryRadius,
          "no-arbitrary-bg-white": noArbitraryBgWhite,
        },
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "destructuredArrayIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // jsx-a11y recommended baseline + W0 tightening (synthesis §9)
      ...jsxA11y.configs.recommended.rules,
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/click-events-have-key-events": "error",

      // W0 canonical design-system rules (synthesis §5)
      "helm/no-raw-button": "error",
      "helm/no-raw-input": "error",
      "helm/no-arbitrary-text-px": "error",
      "helm/no-banned-color": "error",
      "helm/no-arbitrary-radius": "error",
      "helm/no-arbitrary-bg-white": "error",
    },
  }
);
