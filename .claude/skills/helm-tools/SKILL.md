---
name: helm-tools
description: "Which tools this repo gives an agent and how to use each: browsers (Playwright WebKit, Chromium, Apple's Safari MCP, Simulator, the real iPhone), databases (which Supabase project every connector points at), Vercel, Sentry, phone scripts, audits. Read before opening a browser, running SQL, measuring motion or speed, or claiming anything about iPhone."
---

# Helm tools: what you have and how to use it

Check, don't assume. Start every session that touches a browser, database or
phone with: `claude mcp list` (what's connected), and for the phone
`xcrun devicectl list devices` and `xcrun simctl list devices booted`. Write
what you found as AVAILABLE / NOT CONNECTED / NEEDS NICK before you measure.
Authority between connector namespaces: `docs/TOOL_AUTHORITY_MATRIX.md`.

## 1. Databases: which project each tool reaches

| Tool (MCP server) | Project | Mode | Use for |
| --- | --- | --- | --- |
| `supabase-staging-ro` (`.mcp.json`) | **STAGING** "PROSP DATA" `ybmwektreyrwjscxlogv` | read-only Postgres user | Audits, number cross-checks, any question about what a page should show |
| `supabase` (`.mcp.json`) | **PRODUCTION** `qmnssrrolpinvwjjnufo` | read/write | Only an approved production change (AGENTS.md "Database") |
| `supabase-readonly` (`.mcp.json`) | **PRODUCTION** `qmnssrrolpinvwjjnufo` | read-only | Production evidence only, when the task needs it |
| `claude_ai_Supabase` / `mcp__e139bbde…` (account connector) | **PRODUCTION** (the only project it lists, `config/mcp-connector-ids.json`) | read/write | Same as `supabase` |
| `plugin_supabase_supabase` (a user plugin, if installed) | **Any project on the account**, production included: the `project_id` argument decides | read/write | Not for audits; name the project on every call |
| Local Docker stack (`npx supabase start`) | local | read/write | Rehearsing migrations, `clubhouse:perf` |

Rules:
- Vercel Preview and local development read **staging**. Production reads
  **production**. A preview is safe to click through; it is not production.
- During an audit, only `supabase-staging-ro` is used. The audit session
  (`HELM_AUDIT=1`) runs `.claude/hooks/no-prod-in-audit.mjs`, which refuses
  any other Supabase server and any MCP call that names `qmnssrrolpinvwjjnufo`.
- Read `src/lib/types/database.ts` before writing SQL.
- `is_test` rounds exist on staging. Say whether a number includes them.

## 2. Browsers: which engine, for what

The standard is `.claude/rules/browsers.md`. In short: **W** Playwright WebKit
(default, phone), **S** real Safari (Apple's Safari MCP, Simulator Safari),
**D** the real iPhone (the only proof of smoothness), **C** Chromium (only what
Chromium alone measures, labelled). Every finding names its tier.

| Tool | Tier | Engine | Signed in how | Step by step |
| --- | --- | --- | --- | --- |
| `playwright-webkit` MCP | W | Playwright WebKit, `iPhone 17 Pro` | Signed out in `.mcp.json`. The audit config (`.claude/audit.mcp.json`) loads `.auth/staging-player.json`, and `playwright-webkit-coach` loads `.auth/staging-coach.json` | 1. Mint the state (below). 2. `browser_navigate` to the staging URL. 3. `browser_snapshot` for structure, `browser_take_screenshot` for the look, `browser_evaluate` for probes. 4. Save files under the run folder, not the repo. |
| `playwright` MCP | C | Chrome / Chromium | Storage state, or signs in fresh | As above, desktop 1440×932. Label numbers "Chromium". |
| `playwright-cli` (`npx @playwright/cli`) | W or C | Either (`--browser webkit`) | `state-load` | Long sessions: writes snapshots and screenshots to files and returns paths, so it uses fewer tokens than MCP. `-s <name>` keeps a session. |
| `safari-native` MCP (`safaridriver --mcp`) | S | Real Safari 27 on the Mac | You sign in once by hand in its window | 1. Nick has turned on Safari > Settings > Developer > "Allow remote automation and external agents". 2. `navigate_to_url`, `set_viewport_size` 402×874. 3. `evaluate_javascript` for probes, INP and LCP. 4. `screenshot`. No frame timing. |
| Simulator Safari | S | iOS Safari (Mac GPU) | Session minted by the session script | Appium (`npm i -g appium`, `appium driver install xcuitest`), then a WebDriver session with `platformName: iOS`, `appium:automationName: XCUITest`, `browserName: Safari`, `appium:udid`. The first session builds WebDriverAgent (minutes; run it alone). Probes and LCP work through `execute/sync`. Real taps: W3C touch actions in the `NATIVE_APP` context, at the element's CSS point plus the content's top offset (49 pt under the status bar on a 390-wide phone; Safari's bar is at the bottom). They arrive as a trusted `click` with no touch or pointer events, so **no INP here**; INP is D. Screens: `xcrun simctl io <udid> screenshot`. Video: `recordVideo` (60 fps). |
| Real iPhone | D | iOS Safari | Nick signs in on the phone | `scripts/phone/` (README there): `wda-start.sh`, then `chunk.sh <plan>` for Animation Hitches mapped to steps. Web Inspector: Mac Safari > Develop > the iPhone > the page > Timelines > Frames. Needs the cable and an unlocked phone. |
| `chrome-devtools` MCP | C | Chrome, isolated profile | Not signed in (`--isolated`) | Traces (`performance_start_trace` / `stop` / `analyze_insight`), CPU and network throttling, Lighthouse (no performance category). `--autoConnect` to your own Chrome only when Nick says so in that session. |
| `next-devtools` MCP | n/a | Next dev server | n/a | Runtime errors, routes, logs from a running `next dev`. |

User-scope servers on Nick's Mac (`safari`, `safari-devtools`) are not the
standard; prefer `safari-native` for tier S.

Probes (`scripts/clubhouse/audit/`, run through `browser_evaluate` /
`evaluate_javascript`): `probe.js` (layout, overflow, text, targets,
card-in-card, page edge), `contrast.mjs` (painted contrast against the real
background), `motion.mjs` (animation inventory and transition timing),
`safari-vitals.js` (INP and LCP from Safari's Event Timing and LCP APIs; INP
needs a real tap or native click, since a scripted click records no event).
A second accessibility engine finds what axe misses: install
`accessibility-checker-engine` (IBM Equal Access, 26 MB, no browser download)
outside the repo, inject its `ace-window.js` with `page.addScriptTag`, then
`new ace.Checker().check(document, ['IBM_Accessibility'])` (works in WebKit).
On the coach home, 13 Nov, it found a duplicate `id` and content outside a
landmark; axe found a label/name mismatch.

Signing in: no agent types a password, ever.
`node scripts/clubhouse/audit/session.mjs --role coach|player --base <preview or local URL>`
mints a staging-only session for a Demo University Golf demo account, writes
`.auth/staging-<role>.json`, and refuses any other project or account.
`--help` lists the rest. Previews sit behind Vercel's login: run
`node scripts/clubhouse/audit/preview-bypass.mjs --fetch` once (it copies the
project's existing Protection Bypass for Automation secret into `.auth/`, never
printed, nothing in Vercel changes; Nick's yes, 13 Nov 2026) and every minted
session carries Vercel's cookie. `--check --base <url>` shows whether it opens;
`--forget` at clean-up. One file per browser: Supabase rotates refresh
tokens, so two browsers on one file sign each other out. The audit servers read
`staging-player.json` (`playwright-webkit`), `staging-coach.json`
(`playwright-webkit-coach`) and `staging-coach-desktop.json` (`playwright`):
mint each with `--out` right before that server's first page, and again after a
`browser_close`.

Start an audit session with only the audit servers:
`HELM_AUDIT=1 claude --strict-mcp-config --mcp-config .claude/audit.mcp.json`.

## 3. Pages that write when you open them

Opening these writes rows, even on a read-only walk. On staging that is
allowed; log each one in the run's `writes.md`. List and file:line in
`docs/clubhouse/audit/WRITES-ON-OPEN.md`.

## 4. Scripts (read the file's `--help` first)

| Need | Command | Engine |
| --- | --- | --- |
| axe on every preview screen and state | `npm run clubhouse:a11y` | Chromium + WebKit |
| Tap targets, iOS zoom, sideways scroll at 390/430 | `node scripts/clubhouse/native.mjs` | WebKit |
| Presentation gate | `npm run clubhouse:quality` (`:full`) | Chromium + WebKit |
| Before/after screenshots | `npm run clubhouse:shots`, `node scripts/clubhouse/gallery.mjs`, `node scripts/clubhouse/side-by-side.mjs` | Both |
| Measured speed (prod build, local DB, ~12 min, heavy) | `npm run clubhouse:perf` | Chromium |
| Real-route shots, both roles | `npx playwright test e2e/clubhouse-route-shots.spec.ts` | WebKit |

Never run `hairlines.mjs`, `pressed-hover.mjs` or `radius-steps.mjs` with
`--apply`, or `spacing-scale` / `type-roles` in write mode, during an audit:
they edit stylesheets.

## 5. Other services

- Vercel: account connector (`claude_ai_Vercel` / `mcp__fba2ada3…`). Reading is
  fine. Deploy, promote and rollback are `ask` in settings and are Nick's call;
  a preview deploy is a deploy too.
- Sentry: `claude_ai_Sentry` (org helm-xs), read-only investigation
  (`helm-sentry` skill).
- PostHog: no MCP. Don't add events or change capture settings without Nick
  (players can be minors).
