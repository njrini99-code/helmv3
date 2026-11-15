# Clubhouse quality tooling

## Scope and design authority

Clubhouse uses its own `--ch-*` tokens and shared components. Follow
`src/clubhouse/AGENTS.md`, `DESIGN.md` and the page documentation. Fairway
remains the authority for other Golf surfaces. The optional Claude agent
`.claude/agents/clubhouse-polish-reviewer.md` reports concrete findings against
this system. It is not a required approval ceremony.

The premium audit profile includes all 15 manifest page families and their
shared owners. Expanding that profile is coverage configuration, not evidence
that an external premium-design audit has passed.

## The checks that gate, and what each can prove (15 Nov 2026)

Rebuilt from the 15 Nov UI tooling audit (QUEUE rows tool-01 to tool-09). Every
check names its tier (`.claude/rules/browsers.md`): W Playwright WebKit, S real
Safari, D the real iPhone, C Chromium. None of them is a required check on
`main` yet; making one required is a GitHub setting the owner holds.

| Check | Catches | Tier | Runs | Local command |
| --- | --- | --- | --- | --- |
| CSS ratchet and lint | Raw hex, SVG `overflow: visible`, layout transitions, untokened shadows; counts may only fall | static | Presentation workflow, first | `npm run clubhouse:css` |
| Presentation gate | 36 fixture screens × light/dark: card escape, clipped and cramped text, nested surfaces, phone text, 44 pt targets, row inset, page edge, contrast | W 390, C 1440 | PRs (ready), nightly on `main` | `npm run clubhouse:quality` |
| Motion gate | Every phone gate screen from its first frame, Reduce Motion on and off, plus every popup opening: no layout property animated, every duration a `--ch-dur-*` token, no first-paint entrance or stagger, nothing moving under Reduce Motion. Known breaks in `e2e/clubhouse-gate/motion-known.ts` (63 screens and popups, 164 breaks on 15 Nov) may only shrink | W 390 | Same, after the gate; advisory for its first week on `main`, then it fails the job | `CH_QUALITY=1 npx playwright test -c playwright.clubhouse.config.ts --project motion-phone` |
| Pixel regression | Any changed pixel on the gate screens, phone and desktop, light and dark | W 390, C 1440 | Nightly on `main` renders baselines (artifact `clubhouse-pixel-baselines`); PRs compare against the newest, advisory | `CH_QUALITY=1 CH_PIXELS=1 CH_VISUAL_BASELINES=<dir> npx playwright test -c playwright.clubhouse.config.ts --project pixels-phone --project pixels-desktop` |
| Write journeys | Calendar, Qualifiers, Team Hub, Settings and Messages writes, and the round, each checked in the database | W + C, local Supabase | Nightly | `CH_BASE=… npx playwright test -c playwright.clubhouse-journeys.config.ts` |
| Production public lane | The five public pages of the live site: status, sideways scroll, axe WCAG 2.2 AA, LCP, targets, clipped text, console errors, origins, any write tried on load. GET only; telemetry held | W, iPhone 17 Pro | Nightly (`clubhouse-prod-public.yml`) | `node scripts/clubhouse/audit/prod-public.mjs` |
| Every screen | All 410 screens from the filesystem (GolfHelm, BaseballHelm, Lift Lab, admin, public, Clubhouse fixture states), each in phone and desk, light and dark, with probe and axe findings in one filterable gallery | W phone, C desk | Dispatch: `clubhouse-quality.yml` `screens: true` (public and fixtures), `clubhouse-journeys.yml` `screens: true` (signed-in GolfHelm, seeded) | `node scripts/screens/sweep.mjs --start-dev --access public,fixture` |
| UI tools check | Every tool above and the devices and sign-ins they need, with one fix each | n/a | Local | `npm run doctor -- --ui` |
| Production guards | Suites and scripts that sign in refuse production; the audit hook refuses production in MCP, Bash and WebFetch; no runnable test names the live site | static | Unit tests in CI | `npm run test:file -- scripts/lib/__tests__ scripts/__tests__/hooks scripts/__tests__/no-production-test-targets.test.mjs` |

What none of these prove: smoothness and feel (D only, `helm-safari-performance`),
real Safari rendering and safe areas (S), INP (a real tap on D), and anything
signed in on production (never run; see `docs/clubhouse/audit/WRITES-ON-OPEN.md`).

## Local tools

```sh
npm ci
npm run clubhouse:tools:setup
npm run clubhouse:tools
npm run clubhouse:profile
```

Next DevTools MCP is pinned and available through `.mcp.json`. The setup
command installs its portable section in the ignored repository-local
`.codex/config.toml`, preserving unrelated settings. Reload the MCP client
and use a running Next development server for runtime errors, routes and logs.
The local MCP handshake and discovery of the Next server were verified.
The stale local shadcn transport was removed: its referenced binary was absent,
and this repo has no shadcn component configuration. Clubhouse continues to
use its existing custom components.

Setup reads the existing config directly and atomically replaces it with a
private file. It does not write through a config-file symlink; unrelated
settings from the existing file are retained.

Chrome DevTools MCP 1.12.0 is also pinned in development dependencies and
configured in `.mcp.json` and the portable Codex template. The setup command
updates both DevTools server sections and their nested settings, retaining
other servers. Reload the MCP client after setup. Chrome launches with an
isolated temporary profile; usage statistics and performance CrUX URL lookups
are disabled. It does not attach to your everyday Chrome profile.

Use Chrome's trace start/stop and insight tools for rendering/interaction
investigation, network/console tools for runtime failures, and CSS/snapshot/
screenshot tools for presentation evidence. Save raw traces alongside the
existing ignored audit artifacts. Next DevTools covers framework diagnostics;
Chrome DevTools covers the browser. Chrome traces do not replace physical
Safari/iPhone checks or prove smoothness across the whole app. See the
[official tool reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md).

Local setup/doctor and the Chrome MCP initialization handshake passed on
2026-10-06 (then version 1.10.1, 30 tools). Re-run on 2026-11-13 against the
lockfile's pin: the server reported version 1.12.0 and 32 tools, including trace
start/stop/insights, CSS, console, network and screenshots. All 89 tooling
tests passed. This validates installation and tool discovery; a connected
browser audit requires the client reload and a subsequent profiling session.

React DevTools is pinned with its Electron desktop runtime. The profile
command launches the standalone application; a browser/app connection is a
separate step. Use the React DevTools browser extension for a connected React
profiler, or configure the standalone development bridge before React starts.
No bridge or production script is injected by this change. Safari Web
Inspector on Mac and remote inspection of an unlocked physical iPhone remain
necessary for actual Safari timelines, scrolling and keyboard behavior.

## Browser presentation checks

```sh
npm run clubhouse:quality
npm run clubhouse:quality:full
CH_CAPTURE_DIR=/absolute/local/candidates npm run clubhouse:quality
CH_VISUAL=1 CH_VISUAL_BASELINES=/absolute/reviewed/baselines npm run clubhouse:quality
CH_ENGINES=chromium,webkit CH_MOTION=no-preference,reduce \
  npm run clubhouse:a11y -- settings
```

The dedicated Playwright suite runs Chromium and WebKit with normal and
reduced motion. Smoke mode contains 20 popup/menu cases on a short phone
viewport; full mode contains 132 applicable cases across four viewport sizes.
All phone sheets are tested at three sizes below the 820px boundary; desktop
checks use Modal and menus, matching production owners. Checks cover bounds,
scrolling, keyboard dismissal, focus restoration and axe accessibility. The
existing page/state accessibility catalog accepts explicit engine, motion and
viewport selections and rejects unknown page names. All these checks use
development presentation fixtures. They do not certify authenticated writes,
production performance or devices.

The PR workflow runs smoke checks and the CSS guard. Manual runs can select
full coverage or visual comparison. Diagnostic PNGs and traces are uploaded
as artifacts. Candidate captures are explicitly unreviewed and local only.
Visual comparison requires externally reviewed baselines for the same OS and
browser version, never updates them, and fails on missing files or pixel
changes. Screenshots remain outside Git. For a manual visual CI run, supply
the numeric run ID containing the reviewed `clubhouse-quality-baselines`
artifact. Baselines have not been owner-approved as part of this change.

## CSS and measured performance

```sh
npm run clubhouse:css
npm run clubhouse:css -- <base-sha>
npm run clubhouse:perf:check -- /absolute/before.json /absolute/after.json
```

Stylelint and PostCSS check syntax, duplicate declarations, unknown
properties, empty blocks, broad transitions and layout keyframes. New layout
transitions and unmanaged or undefined shadow tokens are compared with the
immutable Git base; existing reviewed variants are retained by exact source
identity. The default base is the merge base with `origin/main`.

The performance reader consumes raw captures from the existing Clubhouse
performance harness. It requires comparable CPU throttling, recorded dates,
at least three unique samples per case and required metrics. It checks
absolute layout-shift/interaction/flash limits and median regressions against
the measured before-run spread. Missing metrics stay unknown or fail when
required. Configure exact required cases in
`config/clubhouse/quality-budgets.json` to enforce broader coverage.

Existing performance harness coverage is limited to Home, Stats, CoachHelm,
Qualifiers and Rounds journeys. No live performance capture was available for
this tooling change. Parser tests verify enforcement, not product smoothness.
Lighthouse remains a Chromium navigation lab check: it no longer advertises
a Safari user agent or an INP assertion without measured interactions.

## Tooling verification — 2026-10-06

All 132 applicable presentation cases passed locally in Chromium and WebKit,
with normal/reduced motion at 390×480, 430×932, 768×600 and 1280×800 (exit 0).
All 86 Clubhouse tooling tests passed. The CSS guard reported zero findings;
scoped lint/TypeScript, Markdown and knowledge/authority checks passed. The
missing-baseline path failed explicitly without creating a baseline. The tool
doctor and Next MCP handshake passed. These results certify the tooling and
observed presentation fixtures, not production performance or release approval.

## Release evidence still required

Record reviewed visual baselines, authenticated task/failure journeys,
production-build before/after timings and physical Mac Safari/iPhone results
in the existing page VERIFY logs and release audit. Automated fixtures and
reviewer opinions do not replace those observations. This tooling change does
not enable flags, apply migrations, merge or deploy.

## Native Mac Safari observation — 2026-10-06

Safari developer features were enabled and Web Inspector was verified against
the local `/clubhouse-preview/popup-lab` development fixture on the Mac mini.
A long-content Modal opened with wrapped text, scrollable content and visible
footer actions while Inspector was docked. A stopped timeline recording
retains screenshots, JavaScript/events, layout/rendering and CPU activity in
the open Inspector. Export was attempted using docked and detached Inspector
controls, but no save dialog or exported file was produced. The recording is
not yet a durable evidence artifact; keep Inspector open until it is saved.

The timeline exposes forced layout during button press (`lib/press.ts`),
scroll locking (`lib/overlay-scroll.ts`) and native modal opening
(`lib/dialog-lifetime.ts`). These are investigation leads; this observation
does not establish excessive duration or a production jank cause. The capture
includes development instrumentation, idle time and UI automation. It is not
a comparable before/after performance sample or a frame-budget pass.

The console reported two source-map loading errors, font preload warnings
and development instrumentation/Fast Refresh messages. No physical iPhone
appeared in Safari's device inspection list. Authenticated production-build
journeys, iPhone keyboard/safe-area behavior and VoiceOver remain unverified.

## Component playground

With the development server running, open `/clubhouse-preview/components`.
This workspace renders the real shared Clubhouse components inside isolated
original/candidate galleries. Select an actual 390, 430, 768 or 1280px frame
width and short, standard or tall height. Large frames scroll inside the
workspace instead of pretending that a scaled phone is a desktop viewport.
Use long-text stress, keyboard focus, pressed controls, disabled/loading/error
fixtures and nested menus inside the shared Modal/phone sheet.

Body size, content spacing, corners and reading shadows can be tuned locally.
Motion duration changes only the replay sample; it respects reduced motion and
does not rewrite production CSS timings or JavaScript motion constants. Until
adjusted, each control preserves the original live styles. Reset removes every
override. Download/copy exports a reviewable CSS proposal, including explicit
Surface mappings where that component still owns literal styles. Nothing is
persisted, saved to team data or applied to production tokens.

Both routes return 404 in production. Development allows only the exact gallery
route in same-origin frames; all other routes and production keep their existing
frame protection. This is component inspection, not coverage of every page,
authenticated flow or physical-device performance. The dedicated browser lane
includes proposal isolation, reset, exports and nested-overlay keyboard checks
for Chromium/WebKit with normal/reduced motion.

## Reference priorities

Use these three repositories when reviewing shared component quality:

| Reference | Inspect | Apply to Clubhouse |
| --- | --- | --- |
| [Open Props](https://github.com/argyleink/open-props) | Spacing, typography, radii, easing and shadow scales; strength/color separation | Compare the existing semantic `--ch-*` vocabulary and document gaps; propose changes in the playground |
| [GUI Challenges](https://github.com/argyleink/gui-challenges) | Dialogs, switches, menus, toasts and transitions with adaptive/browser behavior | Review keyboard, focus return, scrolling, pointer behavior and reduced motion against real shared primitives |
| [Radix Themes](https://github.com/radix-ui/themes) | Component CSS owners, base/variant/size separation and its playground | Keep one owner per component and exercise state × size × viewport combinations |

These are references for implementation review. The existing Clubhouse tokens,
plain CSS, native dialog behavior and owner-approved designs remain the runtime
system. Introducing an upstream theme or reset requires a separate reviewed
migration. Reference quality does not certify Clubhouse's release.

Stylelint 16.25.0 is installed. `npm run clubhouse:css` uses it with PostCSS
checks
and runs in the presentation CI lane. The scoped rules reject duplicate
properties/tokens, unknown properties, empty blocks, invalid hex colors,
unspaced `calc()` operators and ineffective `!important` in keyframes. AST
checks also reject `transition: all`, layout keyframes/new layout transitions
and new outer shadows that bypass or reference absent depth tokens. See the
[Stylelint rule reference](https://stylelint.io/user-guide/rules/).

Lint catches CSS defects and enforceable conventions. Pair it with browser
accessibility, keyboard, responsive and screenshot checks, plus real traces for
smoothness; it cannot judge visual taste or prove frame pacing.

## Full component and premium audit coverage

The component playground now indexes all 253 non-test TSX modules, all 32
stylesheets and 35 contextual preview routes. Every shared UI module is linked
to direct examples or its provider/error/phone context; indexed coverage is
not executed state coverage. Closed catalog disclosures do not mount token
tables. `clubhouse:catalog -- --check` is enforced in presentation CI.

`clubhouse:materials` emits CSS/inline declaration ownership and review
classification; it does not treat illustration, scoring marks or focus rings
as cosmetic defects. `scripts/clubhouse/premium-capture.mjs --sha <7hex>`
repeats the full local synthetic state/axe and WebKit resting evidence matrix.
Use `--resume` only to resume unchanged source; captures retain source labels.

[PREMIUM_AUDIT.md](PREMIUM_AUDIT.md) records 383 completed cases, the partial
visual rubric and release limits. Physical iPhone, complete manual states and
authenticated production-build latency remain separate.
