# Dependabot alert triage — 2026-09-06

Source: `gh api repos/njrini99-code/helmv3/dependabot/alerts?state=open --paginate`
(28 open alerts, captured 2026-09-06). Report only — nothing here was
dismissed and no bump PR was opened; every action column below is a
recommendation for the owner.

**Headline: no high-severity alert is a direct runtime dependency of the
deployed app with a fix available and no open PR.** Every one of the 28
alerts resolves to a package that `package-lock.json` marks `"dev": true`
(dev-tree only — playwright/puppeteer/vercel-CLI/momentic transitive deps
that never ship in the Next.js production bundle), or to a nested copy
inside `tools/ultra-agent-audit/` — a standalone local UX-audit dev server
(`node src/server.js`, not part of the deployed app, not built or run in
production). Two packages (`fast-uri`, `ip-address`) already have a safe
version forced at the repo root via `package.json`'s `overrides`, but the
override does not reach a copy nested one level deeper inside `momentic`'s
own `node_modules` (npm overrides are non-transitive unless you nest the
override key), so Dependabot still flags that inner copy.

## How "reachable at runtime" was determined

For each package: is it a direct dependency in root `package.json` or
`tools/ultra-agent-audit/package.json`, or transitive; and does the
`package-lock.json` entry for the flagged copy carry `"dev": true` (dev-only
install tree, never bundled into `.next/` output) or no `dev` flag (would
ship in production if actually imported by `src/`). Checked directly against
`package-lock.json` (`node scripts` not run — read as data), not assumed.

| # | Package | Ecosystem | Severity | CVSS | GHSA | Vulnerable range | Installed / location | Dep type | Reachable at runtime? | Covered by open PR? | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 183 | fast-uri | npm | high | 7.5 | GHSA-5jgf-p345-68v8 | `>=2.4.2 <2.4.5` \| `>=3.1.3 <3.1.6` \| `>=4.0.1 <4.1.3` | `node_modules/momentic/node_modules/fast-uri@3.1.4` | transitive, dev (`momentic` devDependency) | No — dev-only test tool | No | Dismiss as not-applicable (root `fast-uri` already overridden to `^3.1.7`, safe); real fix needs `momentic` to bump its own `fast-uri`, track upstream or `npm dedupe` after their next release |
| 182 | fast-uri | npm | high | 7.5 | GHSA-f65p-4m7j-42xc | `>=2.3.1 <2.4.5` \| `>=3.0.0 <3.1.6` \| `>=4.0.0 <4.1.3` | same as #183 | transitive, dev | No | No | Same as #183 |
| 181 | fast-uri | npm | high | 7.5 | GHSA-fph4-wmhf-6fwf | `>=2.4.1 <2.4.5` \| `>=3.1.2 <3.1.6` \| `>=4.0.0 <4.1.3` | same as #183 | transitive, dev | No | No | Same as #183 |
| 180 | fast-uri | npm | high | 7.5 | GHSA-jqff-g426-hqxp | `>=2.3.1 <2.4.5` \| `>=3.0.0 <3.1.6` \| `>=4.0.0 <4.1.3` | same as #183 | transitive, dev | No | No | Same as #183 |
| 132 | fast-uri | npm | high | 7.5 | GHSA-7p8r-x3mc-p8w7 | `<2.4.4` \| `>=3.0.0 <3.1.5` \| `>=4.0.0 <4.1.2` | same as #183 | transitive, dev | No | No | Same as #183 |
| 179 | qs | npm | medium | 3.7 | GHSA-x5fp-wj9c-mxmx | `>=6.14.2 <=6.15.3` | `tools/ultra-agent-audit/node_modules/qs@6.15.2` | transitive (via `express`), runtime *for that standalone tool* | No — `tools/ultra-agent-audit` is a local dev-only UX-audit server, not built or deployed with the app | No | Needs owner: bump `express`/`qs` in `tools/ultra-agent-audit` when convenient; not urgent since the tool never runs in prod |
| 178 | qs | npm | medium | 5.3 | GHSA-4mjr-xmp4-gh2g | `>=2.2.5 <6.16.0` | same as #179 | transitive, runtime for that tool | No (see #179) | No | Same as #179 |
| 173 | @faker-js/faker | npm | high | 7.8 | GHSA-qxc2-j82w-r537 | `<=10.4.0` | `node_modules/momentic/node_modules/@faker-js/faker@8.4.1` | transitive, dev (`momentic`) | No — dev-only test tool | No | Dismiss as not-applicable (test-data generator never runs in prod) or wait for `momentic` upstream bump |
| 168 | undici | npm | medium | 4.2 | GHSA-m8rv-5g2x-5cg5 | `<6.28.0` \| `>=7.0.0 <7.29.0` \| `>=8.0.0 <8.9.0` | root `node_modules/undici@7.29.0` (safe, outside range) is fine; vulnerable copies are `@vercel/blob`'s `undici@6.28.0`\*, `@vercel/node`'s `undici@5.28.4`, `vercel` CLI's `undici@5.29.0` | transitive, dev (all three consuming packages are dev-tree) | No | No | Dismiss as not-applicable for the two `<6.28.0`/`5.x` copies once verified fixed upstream; otherwise needs owner to bump `@vercel/node`/`vercel` CLI |
| 167 | undici | npm | medium | 4.8 | GHSA-v3r7-h72x-cjcm | `<6.28.0` \| `>=7.0.0 <7.29.0` \| `>=8.0.0 <8.9.0` | same nested copies as #168 | transitive, dev | No | No | Same as #168 |
| 166 | undici | npm | medium | 4.8 | GHSA-8xcm-r25x-g524 | `<6.28.0` \| `>=7.0.0 <7.29.0` \| `>=8.0.0 <8.9.0` | same nested copies as #168 | transitive, dev | No | No | Same as #168 |
| 161 | undici | npm | low | 3.7 | GHSA-g8m3-5g58-fq7m | `<6.27.0` \| `>=7.0.0 <7.28.0` \| `>=8.0.0 <8.5.0` | same nested copies as #168 | transitive, dev | No | No | Same as #168 |
| 160 | undici | npm | medium | 5.9 | GHSA-p88m-4jfj-68fv | `<6.27.0` \| `>=7.0.0 <7.28.0` \| `>=8.0.0 <8.5.0` | same nested copies as #168 | transitive, dev | No | No | Same as #168 |
| 158 | undici | npm | low | 3.7 | GHSA-35p6-xmwp-9g52 | `<6.27.0` \| `>=7.0.0 <7.28.0` \| `>=8.0.0 <8.5.0` | same nested copies as #168 | transitive, dev | No | No | Same as #168 |
| 151 | undici | npm | medium | 4.6 | GHSA-4992-7rv2-5pvq | `<6.24.0` \| `>=7.0.0 <7.24.0` | same nested copies as #168 | transitive, dev | No | No | Same as #168 |
| 150 | undici | npm | medium | 6.5 | GHSA-2mjp-6q6p-2qxm | `<6.24.0` \| `>=7.0.0 <7.24.0` | same nested copies as #168 | transitive, dev | No | No | Same as #168 |
| 141 | undici | npm | low | 3.1 | GHSA-cxrh-j4jr-qwg3 | `<5.29.0` \| `>=6.0.0 <6.21.2` \| `>=7.0.0 <7.5.0` | `@vercel/node`'s `undici@5.28.4` (`<5.29.0`, in range) | transitive, dev | No | No | Same as #168 |
| 140 | undici | npm | medium | 6.8 | GHSA-c76h-2ccp-4975 | `>=4.5.0 <5.28.5` \| `>=6.0.0 <6.21.1` \| `>=7.0.0 <7.2.3` | `@vercel/node`'s `undici@5.28.4` (in range) | transitive, dev | No | No | Same as #168 |
| 157 | @tootallnate/once | npm | low | 3.3 | GHSA-vpq2-c234-7xj6 | `>=3.0.0 <3.0.1` \| `<2.0.1` | root `node_modules/@tootallnate/once@2.0.0`, `"dev": true` | transitive (puppeteer-core chain), dev | No — dev/test only | No | Dismiss as not-applicable, or bump the puppeteer chain when it updates upstream |
| 138 | extract-zip | npm | high | 8.1 | GHSA-jmr9-qjv8-65gv | `<=2.0.1` | root `node_modules/extract-zip@2.0.1`, `"dev": true` | transitive (puppeteer chain), dev | No — dev/test only (unpacks browser binaries during test install, never at request time) | No | Dismiss as not-applicable given dev-only usage, or bump puppeteer when it ships a fix |
| 136 | hono | npm | medium | 4.8 | GHSA-f23p-vx2j-j53r | `>=3.8.0 <4.12.34` | root `node_modules/hono@4.13.7` is safe; vulnerable copy is `node_modules/momentic/node_modules/hono@4.12.31` | transitive, dev (`momentic`) | No | No | Dismiss as not-applicable (root already safe); wait for `momentic` bump |
| 135 | hono | npm | low | 3.7 | GHSA-79qm-7rj5-m7r9 | `>=4.7.0 <4.12.34` | same as #136 | transitive, dev | No | No | Same as #136 |
| 134 | hono | npm | medium | 5.3 | GHSA-54fx-42gc-7vw4 | `>=4.12.0 <4.12.34` | same as #136 | transitive, dev | No | No | Same as #136 |
| 131 | ip-address | npm | high | 0.0 | GHSA-mwp4-54f8-5fhr | `<=10.3.0` | root `node_modules/ip-address@10.4.0` is safe (overridden); vulnerable copy is `node_modules/momentic/node_modules/ip-address@10.2.0` | transitive, dev (`momentic`) | No | No | Dismiss as not-applicable (root already safe via `overrides`); wait for `momentic` bump |
| 130 | socket.io-parser | npm | high | 7.5 | GHSA-2m8v-j782-fhvr | `>=4.0.0 <4.2.7` \| `>=3.4.0 <3.4.5` \| `<3.3.6` | root `node_modules/socket.io-parser@4.2.7` is safe; vulnerable copy is `node_modules/momentic/node_modules/socket.io-parser@4.2.6` | transitive, dev (`momentic`) | No | No | Dismiss as not-applicable (root already safe); wait for `momentic` bump |
| 122 | ip-address | npm | medium | 0.0 | GHSA-4xrf-jv44-h6hh | `>=10.1.1 <=10.2.1` | same momentic-nested copy as #131 | transitive, dev | No | No | Same as #131 |
| 121 | ip-address | npm | medium | 0.0 | GHSA-22jq-vg5j-6vgg | `>=10.1.1 <=10.2.0` | same momentic-nested copy as #131 | transitive, dev | No | No | Same as #131 |
| 26 | uuid | npm | medium | 7.5 | GHSA-w5hq-g745-h8pq | `>=12.0.0 <12.0.1` \| `>=13.0.0 <13.0.1` \| `<11.1.1` | root `node_modules/uuid@8.3.2`, `"dev": true` (also `xcode`'s nested `uuid@7.0.3`, also dev) | transitive (test tooling), dev | No — dev-only; the app's own `uuid` needs, if any, would be a separate direct dependency (none found in root `dependencies`) | No | Dismiss as not-applicable (dev-only), or bump the tool that pulls `uuid@8` transitively when it updates |

\* `undici` alerts overlap across several ranges for the same handful of
nested copies (`@vercel/node@…/undici@5.28.4`, `@vercel/blob@…/undici@6.28.0`,
`vercel` CLI's `undici@5.29.0`, `@apidevtools/json-schema-ref-parser`'s
`undici@8.10.2`) — one physical outdated copy can trip multiple GHSA ranges
(different CVEs, same fixed-version boundary). Root `node_modules/undici`
is already `7.29.0`, outside every listed vulnerable range.

## What would actually reduce these

None of the five open Dependabot PRs (#1753 js-yaml, #1755 github-actions
group, #1756 dev-dependencies group, #1757 production-dependencies group,
#1758 framer-motion) touch any of the packages above by name — they bump
`momentic` itself in #1756 (`3.52.0` → `3.52.1`), which may or may not carry
forward its own nested `fast-uri`/`ip-address`/`hono`/`socket.io-parser`/
`@faker-js/faker`/`qs`/`uuid` bumps; that needs verifying against `momentic`'s
own changelog before assuming it clears any of the above, so none are marked
"covered" here.

## Not verified

- Whether `momentic@3.52.1` (the version in open PR #1756) actually updates
  its bundled copies of `fast-uri`, `ip-address`, `hono`, `socket.io-parser`,
  `@faker-js/faker`, `qs`, or `uuid` — would need `npm view momentic@3.52.1
  dependencies` or installing the PR branch, not done here.
- Whether `@vercel/node`, `@vercel/blob`, and the `vercel` CLI have released
  versions that bump their nested `undici` past the fixed thresholds —
  checked only the currently-locked versions, not upstream release notes.
