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
viewport; full mode contains 160 cases across four viewport sizes and all
popup variants. Checks cover bounds, scrolling, keyboard dismissal, focus
restoration and axe accessibility. The existing page/state accessibility
catalog accepts explicit engine, motion and viewport selections and rejects
unknown page names. All these checks use development presentation fixtures.
They do not certify authenticated writes, production performance or devices.

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

## Release evidence still required

Record reviewed visual baselines, authenticated task/failure journeys,
production-build before/after timings and physical Mac Safari/iPhone results
in the existing page VERIFY logs and release audit. Automated fixtures and
reviewer opinions do not replace those observations. This tooling change does
not enable flags, apply migrations, merge or deploy.
