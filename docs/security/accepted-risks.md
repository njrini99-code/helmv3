# Accepted dependency risks

Dependabot/`npm audit` alerts that are knowingly left open because the
vulnerable code path is unreachable in this app, and no non-breaking fix
exists. An accepted-risk entry is not a substitute for a real fix — it is
what to write instead of silently dismissing an alert with no reason, or
force-installing a major downgrade that breaks the tool it belongs to.

Re-check each entry whenever `npm audit` reports a new `first_patched_version`
for the same advisory — that turns this from an accepted risk back into a
normal upgrade.

---

## GHSA-jmr9-qjv8-65gv — `extract-zip` unvalidated symlink path traversal

- **Dependabot alert:** #138 (`extract-zip`, high, CVSS 8.1, CWE-22)
- **Vulnerable range:** `<= 2.0.1`. **First patched version: none** — `npm audit`
  reports no fixed release exists upstream for this advisory as of 2026-09-05.
- **Where it comes from** (`npm ls extract-zip`), both dev-only, both transitive:
  - `@lhci/cli` → `lighthouse` → `puppeteer-core` → `@puppeteer/browsers` →
    `extract-zip@2.0.1`
  - `promptfoo` → `@openai/codex-security` → `extract-zip@2.0.1`
- **What the advisory actually requires:** `extract-zip` extracts a
  maliciously crafted `.zip` whose entries contain symlinks that resolve
  outside the target directory, letting extraction write files anywhere on
  disk the process can reach.
- **Why it is unreachable here:**
  - Both call sites extract archives fetched by the tool itself from a
    trusted, hardcoded source — `@puppeteer/browsers` downloads Chromium
    builds from Google's CDN to populate its local browser cache;
    `@openai/codex-security` (a `promptfoo` eval dependency) extracts its own
    packaged assets. Neither ever extracts a zip supplied by an end user, a
    request body, an uploaded file, or any other attacker-influenced input.
  - Both are `devDependencies`, used only for local/CI tooling
    (Lighthouse CI audits, `promptfoo` eval runs) — neither ships inside the
    Next.js app bundle, the iOS/Android Capacitor apps, or any server
    runtime that serves real traffic.
  - The only `npm audit fix` remediation path is downgrading `@lhci/cli` to
    `0.6.1` (`isSemVerMajor: true` — a major-version regression), which would
    break the actual Lighthouse CI functionality that tool is kept for, in
    exchange for closing a code path that was never exercisable in the first
    place.
- **Decision:** accept the risk. Do not force-downgrade `@lhci/cli`. Do not
  dismiss the Dependabot alert as a false positive — the vulnerability is
  real, just unreachable given how these two dev-only tools are used here.
- **Revisit when:** either `@lhci/cli`/`lighthouse`/`puppeteer-core` or
  `promptfoo`/`@openai/codex-security` ships a version pulling a patched
  `extract-zip`, or `extract-zip` itself cuts a fixed release.
