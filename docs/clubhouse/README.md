# Clubhouse: adding a new design

How a page goes from a design in `design/handoff/` to a verified page behind
the `golf_clubhouse_ui` flag. This is the Foundation V2 process (D-60 to
D-69; the owner's plan is in `foundation-v2/`). The rules that hold
throughout are in `.claude/rules/clubhouse.md`, and `npm run clubhouse:check`
enforces every step marked (checked).

Where things live:

| What | Where |
| --- | --- |
| Which screens exist, and which are rebuilt | `SCREENS.md` |
| Gates, decisions, questions, data gaps, verification log | `PROGRESS.md` (the overview) |
| Which handoff files are current | `design/handoff/VERSIONS.md` |
| One manifest per page: identity, routes, features, paths, status, actions, held plans | `config/clubhouse/pages/P###-<slug>.json` |
| Every state and outcome, numbered | `catalog/<slug>.md` (CH- codes) and `config/clubhouse/bridge-contracts.json` (Bridge IDs) |
| The six page docs | `pages/P###-<slug>/` (PAGE, DESIGN, CONTRACT, WIRING, VERIFY, CHANGELOG) |
| The per-gate checklist | `screens/<slug>.md` |
| The phone spec | `phone/<slug>.md` |
| Held features and data | `held/features/`, `held/data/` |
| Every audit, plan and inventory: date, scope, status, pages touched | [`AUDITS.md`](AUDITS.md) (generated from `config/clubhouse/audits.json`; register a new audit doc there) |
| Read-only views of all of the above | `generated/` (never edit; `node scripts/clubhouse/registry.mjs sync` writes them) |
| Templates | `templates/`, `CHECKLIST_TEMPLATE.md`, `CATALOG_TEMPLATE.md` |

## Page IDs and numbers

- **Page IDs** are permanent (D-60): P001 Shell, P002 Home, P003 Roster,
  P004 Stats team, P005 Stats player, P006 Calendar, P007 Messages, P008
  Settings, P009 Qualifiers. A new page takes the next free ID when its
  build starts, and its Bridge namespace is its number (P010 is 10). A page
  that isn't being built yet has no ID.
- **CH- codes** (`catalog/README.md`) sit on elements (`data-ch-code`, or a
  component's `code` prop) and name the tests. They never change.
- **Bridge IDs** (D-68) are the namespace, a two-digit category and a
  two-digit item: `70612` is Messages, category 06, item 12. Each catalog
  row gets one through `config/clubhouse/category-map.json` (a default per
  catalog kind, plus named exceptions). `registry.mjs sync` mints them
  append-only; a minted ID never changes, and a retired one goes to
  `bridge-tombstones.json` and is never reused (checked). For now they are
  recorded only; nothing is sent to the Bridge until it is wired (owner).

## 1. Drop in the design

- Copy the owner's bundle into `design/handoff/` unchanged, and update
  `VERSIONS.md`: which boards are new, which files changed, and anything not
  taken (with the reason).
- Where the design's README disagrees with a logged decision or the rules,
  ask the owner and log the answer as a `D-n` decision. Nothing from
  Fairway is reused.

## 2. Register the page (checked)

- Add `config/clubhouse/pages/P###-<slug>.json` (copy a sibling): routes,
  roles, semantic features from `memory/registry.yml` (checked), the design
  files (checked), the implementation paths (checked once it is started),
  the `PROGRESS.md` row it reports to (checked), and its held plans.
- Add the page's row to `PROGRESS.md`, and a checklist copied from
  `CHECKLIST_TEMPLATE.md` to `screens/<slug>.md`.
- Classify every capability the design asks for:

  | Class | Meaning | What to do |
  | --- | --- | --- |
  | EXISTING | The backend already does it | Wire it |
  | PRESENTATION-ONLY | No backend change | Build it |
  | HELD-FEATURE | New server behaviour | Build it behind `isClubhouseFor`, with a plan in `held/features/` (D-61) |
  | HELD-DATA | New schema, policy, storage or RPC | Write the migration with the first line `-- STATUS: WRITTEN — HOLD — NOT APPLIED`, a `HELD.md` row and a plan in `held/data/` (checked). Never apply it |
  | OWNER-DECISION | The product meaning is open | Ask; log a `Q-n` and then its `D-n` |
  | BLOCKED | A dependency is missing | Log it in Data gaps |

- Map every figure to a table and column and every control to a server
  action. A figure the app can't produce is a data gap, shown honestly and
  never invented.

## 3. Write the contract before the build (checked)

Start the six page docs from `templates/` in `pages/P###-<slug>/`, and set
the manifest's `status.docs` to `current`. From then on:

- `CONTRACT.md` answers all 25 categories. Each is `Status: DEFINED` with
  its Bridge IDs, or `Status: N/A — reason`. Loading, empty, server error,
  offline, permission and accessibility are never N/A (D-69). Every page has
  its first-run and filtered empty states, its error toasts, its failed-load
  notices with Try again, its validation, and its offline and permission
  states.
- A contract with no catalog row (a success, an observability rule, a test)
  is added to `bridge-contracts.json` by hand, without a `chCode`, with the
  next free item in its category. It is `implemented` only with a `tests`
  list whose files exist and name its Bridge ID in a test title; otherwise it
  stays `reserved` (checked). Grep the page's own code for every claim: on
  Messages, two of the first twenty were wrong.
- Write only each category's `Status:` line and its notes. `registry.mjs
  sync` writes the contract tables (and the shell line where a section
  names the shell's contracts) from the registry, keeping the notes, so the
  file can't fall behind the catalog (checked).
- `WIRING.md` maps each action: control, component, handler, hook, server
  action, data, contract outcomes, tests. Meaningful actions get an
  `ACT-P###-NAME` in the manifest, whose Bridge outcomes must exist (checked).

## 4. Build (gates `desktop`, `wired`, `states`, `error-tracking`)

| What | Where |
| --- | --- |
| Screen components | `src/clubhouse/screens/<slug>/` |
| Server loader (one pass, reports each failed read, never throws for a partial read) | `src/clubhouse/data/<slug>.ts` |
| Route entry, flag check, not-on-team and no-team states | `src/clubhouse/routes/<slug>.tsx`, called from the page under `src/app/golf/(dashboard)/dashboard/…` through `isClubhouseFor` |
| Nav: the page shows in Clubhouse only once listed | `CH_REBUILT_ROUTES` in `src/clubhouse/shell/nav.ts`, and tick it in `SCREENS.md` (checked) |
| Styles, `.ch-*` classes and `--ch-*` tokens only | `src/clubhouse/styles/<slug>.css` |
| Preview with sample data and every state (`?state=empty\|failed\|partial\|loading`) | `src/app/clubhouse-preview/[screen]/page.tsx`, fixtures in `src/clubhouse/preview/` |
| Mutations go through `useAction` (offline, slow, error toast, haptic, Sentry) | `src/clubhouse/lib/` |
| Each section in its own component inside a `SectionBoundary`, so a crash stays in that section | the screen |

## 5. Catalog and number every state (gates `states`, `motion`, `accessibility`)

- A new page's catalog starts from `CATALOG_TEMPLATE.md` at
  `catalog/<slug>.md`, with the next free page number in `catalog/README.md`
  and `CATALOG_PAGE` in `scripts/clubhouse/check.mjs` (checked).
- One row per state: toasts, validation, didn't load, empty, loading,
  confirm, motion, haptic, accessibility, network.
- Put the code on the element. A server-side fallback with no element is
  labelled with a comment naming its code.
- `src/clubhouse/__tests__/<slug>.test.tsx` names every test by the codes it
  forces. Kinds 0–5 must be used in code and named by a test unless the row's
  test column says `preview` (checked).
- Run `node scripts/clubhouse/registry.mjs sync` to mint the new rows'
  Bridge IDs, then list them in `CONTRACT.md` under their categories
  (checked). If a row needs a different category than its kind's default,
  add it to `category-map.json` with the reason before syncing.

## 6. Phone (gates `phone-spec`, `phone`)

iPhone only. The owner's phone board (`… - Mobile.html` in
`design/handoff/`, or `design/handoff/mobile/` for the v1 boards) is the
spec; a page without one waits, or has a draft the owner approves first.
Every step, including running it in the iOS app, is in `MOBILE.md`.

## 7. Verify (gates `performance`, `verified`)

    npm run -s typecheck
    npx eslint <changed files>
    npx vitest run src/clubhouse
    npm run -s clubhouse:check
    npm run clubhouse:a11y          # dev server on :3100; add the page and its states to CH_A11Y_PAGES first
    NODE_OPTIONS=--max-old-space-size=8192 npm run build   # when a server surface changed

Force every failure contract once (a loader that throws, an action that
errors, offline, invalid input, permission denied, an optimistic rollback);
a state never observed is not verified. Compare the page with the handoff
side by side at 1280px (and the phone at 390px), and record it in the page's
`VERIFY.md` and the `PROGRESS.md` verification log.

## 8. Update the truth in the same change

The manifest's status, the six page docs, the checklist, the `PROGRESS.md`
gates, the Bridge registry, the tests and any held plan must match reality
(checked where it can be). Then send the owner screenshots. The flag stays
off in production, migrations stay unapplied, and deploys are the owner's
call.

Docs and screenshots move with the code: a page whose implementation changed
needs a dated entry in its `CHANGELOG.md` (`clubhouse:check` fails without one),
and a visible change gets before and after screenshots, named and filed by
`npm run clubhouse:shots`, listed in the page's VERIFY.md `## Screenshots` table
and attached to the PR description, never committed. The steps and the naming
are in `.claude/rules/clubhouse.md`. Each page's PAGE.md links its manifest, docs, code and audits in a generated "Related" block, and [`AUDITS.md`](AUDITS.md) indexes every audit and plan.
