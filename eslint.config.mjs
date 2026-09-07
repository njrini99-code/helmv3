import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

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
import noUncheckedSupabaseError from "./eslint-rules/no-unchecked-supabase-error.mjs";
import noEmptyCollectionOnError from "./eslint-rules/no-empty-collection-on-error.mjs";
import noHealthyValueOnError from "./eslint-rules/no-healthy-value-on-error.mjs";
import noRawErrorInConsole from "./eslint-rules/no-raw-error-in-console.mjs";
import noUncheckedPaginatedRead from "./eslint-rules/no-unchecked-paginated-read.mjs";
// D8 (db-tooling-drift) — the .in() PostgREST URL-length trap
// (.claude/rules/database.md). Ratcheted by scripts/supabase-chunk-audit.mjs.
import noUnchunkedInFilter from "./eslint-rules/no-unchunked-in-filter.mjs";

// Downgrade every `error`-severity rule in a flat-config rules object to
// `warn`. Used by W0 to ship the jsx-a11y recommended set + the six
// custom design-system rules as warnings while Wave 1 sweeps consumer
// code; ratcheted back to `error` after Wave 1 lands lint-clean.
function downgradeErrorsToWarn(rulesObj) {
  const out = {};
  for (const [name, value] of Object.entries(rulesObj)) {
    if (value === "error" || value === 2) {
      out[name] = "warn";
    } else if (Array.isArray(value) && (value[0] === "error" || value[0] === 2)) {
      out[name] = ["warn", ...value.slice(1)];
    } else {
      out[name] = value;
    }
  }
  return out;
}

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "eslint-rules/**",
      // `.gitignore` line 158 is a blanket `scripts/*.js`, and NOTHING matching
      // it is tracked — every one is a local scratch/workflow file. ESLint was
      // still linting them, so `npm run lint:ratchet` failed on a dev machine
      // with violations that cannot exist in CI (the files aren't in the repo)
      // and cannot be fixed by a PR (a fix couldn't be committed either).
      // Measured 2026-08-26: exactly +12 over baseline, all 12 from a single
      // untracked file. Ignoring them costs no coverage and makes the local
      // ratchet count equal CI's. Keep this pattern identical to the
      // `.gitignore` line — `scripts/*.js`, not `scripts/**/*.js`, which would
      // also swallow committed files in subdirectories.
      "scripts/*.js",
    ],
  },
  {
    // helm/no-raw-error-in-console is scoped to src/ ON PURPOSE.
    //
    // Its whole rationale is Sentry's console integration: it captures
    // console.error at the driver and stringifies every argument, so a plain
    // object becomes the literal "[object Object]" and the incident loses its
    // code, message and details. That integration only runs in the APP
    // runtime. scripts/ is CLI tooling whose console output goes to a
    // terminal or a CI log and never becomes an incident, so the same call
    // there costs nothing and forcing describeError into it would import an
    // `@/` alias that scripts/ tsconfig does not even resolve.
    //
    // Measured: 0 violations under src/, 16 under scripts/. Scoping is the
    // honest fix; adding 16 to a baseline would have recorded debt that is
    // not debt.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "helm/no-raw-error-in-console": "error",
    },
  },
  {
    files: ["scripts/**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // The GolfHelm Engineering OS's hooks (P2) are plain Node scripts, same
    // shape as scripts/** above — `npm run lint` doesn't reach .claude/ (it
    // targets src/**/*.{ts,tsx} only), but ad-hoc/future linting of these
    // files should not report 50 fake `process`/`console` no-undef errors,
    // for the same reason the scripts/wf_*.js block above exists: that is
    // exactly how a directory ends up excluded from linting altogether.
    files: [".claude/hooks/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Workflow scripts (the Workflow tool's `script` payload, saved to disk).
    // They are executed inside a sandbox that INJECTS these as globals, so they
    // are never imported or declared in the file itself. Without this block
    // eslint reports 62 no-undef errors that are all false — and 62 fake errors
    // is precisely how a directory ends up excluded from linting altogether,
    // which is what had happened to scripts/ before 2026-08-19.
    files: ["scripts/wf_*.js", "scripts/**/*.workflow.js"],
    languageOptions: {
      globals: {
        agent: "readonly",
        parallel: "readonly",
        pipeline: "readonly",
        phase: "readonly",
        log: "readonly",
        args: "readonly",
        budget: "readonly",
        workflow: "readonly",
      },
    },
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
          "no-unchecked-supabase-error": noUncheckedSupabaseError,
          "no-empty-collection-on-error": noEmptyCollectionOnError,
          "no-healthy-value-on-error": noHealthyValueOnError,
          "no-raw-error-in-console": noRawErrorInConsole,
          "no-unchecked-paginated-read": noUncheckedPaginatedRead,
          "no-unchunked-in-filter": noUnchunkedInFilter,
        },
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "destructuredArrayIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // TODO(orchestrator): ratchet these to 'error' after Wave 1 sweeps lint-clean — see synthesis §5.
      // jsx-a11y recommended baseline + W0 tightening (synthesis §9), shipped as warnings.
      ...downgradeErrorsToWarn(jsxA11y.configs.recommended.rules),
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",

      // W0 canonical design-system rules (synthesis §5), shipped as warnings.
      "helm/no-raw-button": "warn",
      "helm/no-raw-input": "warn",
      "helm/no-arbitrary-text-px": "warn",
      "helm/no-banned-color": "warn",
      "helm/no-arbitrary-radius": "warn",
      "helm/no-arbitrary-bg-white": "warn",

      // 2026-08-07 code-red: a failed Supabase read must not render as an
      // empty one. 15 instances of that were fixed across 12 files in a day.
      //
      // OFF here ON PURPOSE. `npm run lint` runs with --max-warnings 0 and is
      // a hard CI gate, and this rule currently finds 1,111 call sites — so
      // switching it on globally would fail the Lint job on every PR in the
      // repo. That is a decision about how much debt to service, not one to
      // slip in with a bug fix.
      //
      // It runs instead as a RATCHET: `npm run audit:supabase-errors` counts
      // the violations and fails only if the number goes UP
      // (.supabase-error-baseline.json). New code cannot add unchecked reads;
      // the existing 1,111 can be paid down directory by directory, and the
      // baseline lowered as they are. Flip this to "warn" once it reaches 0.
      "helm/no-unchecked-supabase-error": "off",
      // Enforced by scripts/fail-open-audit.mjs, same reason as the rule above:
      // turning it on here would fail Lint on every PR until the debt is paid.
      "helm/no-empty-collection-on-error": "off",
      // Off by default like its siblings: scripts/healthy-on-error-audit.mjs
      // turns it on to take a census, so existing debt does not block every
      // unrelated lint run.
      "helm/no-healthy-value-on-error": "off",
      // Off by default like its siblings: the audit script turns it on to take a
      // census, so existing debt does not block every unrelated lint run.
      "helm/no-unchecked-paginated-read": "off",
      // D8: off here for the same reason as its siblings above —
      // scripts/supabase-chunk-audit.mjs turns it on to take a census so
      // existing debt does not block every unrelated lint run. See
      // .claude/skills/helm-supabase/SKILL.md for the trap this guards.
      "helm/no-unchunked-in-filter": "off",
    },
  },
  {
    // Public marketing surfaces (landing, products, pricing, about, legal) run
    // on their OWN token system — the Helm linen module (helm-landing.module.css)
    // with raw <button>/<input> and a bespoke editorial type scale. The W0
    // design-system rules govern the Fairway DASHBOARD primitives, not these
    // pages, so the raw-element / arbitrary-text-px checks are off here.
    files: [
      "src/app/page.tsx",
      "src/app/about/**/*.{ts,tsx}",
      "src/app/products/**/*.{ts,tsx}",
      "src/app/pricing/**/*.{ts,tsx}",
      "src/app/(legal)/**/*.{ts,tsx}",
      "src/components/landing/**/*.{ts,tsx}",
      "src/components/products/**/*.{ts,tsx}",
    ],
    rules: {
      "helm/no-raw-button": "off",
      "helm/no-raw-input": "off",
      "helm/no-arbitrary-text-px": "off",
    },
  }
);
