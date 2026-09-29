# Clubhouse: adding a new design

How a new page goes from a design in `design/handoff/` to a verified page
behind the `golf_clubhouse_ui` flag. The rules that hold throughout are in
`.claude/rules/clubhouse.md`. The tracker is `PROGRESS.md`, and
`npm run clubhouse:check` enforces the steps marked (checked).

## 1. Drop in the design

- Put the new handoff files (`<Page>.html`, its `.jsx`/`.css`/data) and
  screenshots in `design/handoff/`, and design-system changes in
  `design/handoff/design-system/`.
- Nothing from Fairway is reused. Anything the handoff needs that
  `src/clubhouse/ui/` lacks is built there from the design system.

## 2. Spec (gate `spec`)

- Add or unblock the page's row in `PROGRESS.md` (checked: the tracker's
  format).
- Copy `CHECKLIST_TEMPLATE.md` to `screens/<slug>.md`. Every gate has a
  section, and a gate can't be marked `done` while its section has an
  unchecked box (checked).
- Map every figure to a table and column, and every control to a server
  action. Anything missing is logged as a data gap or a migration to write,
  and migrations are never applied by an agent.
- Where the README and the screenshots disagree, the owner decides and it is
  logged as a `D-n` decision.

## 3. Build (gates `desktop`, `wired`, `states`, `error-tracking`)

| What | Where |
| --- | --- |
| Screen components | `src/clubhouse/screens/<slug>/` |
| Server loader (one pass, reports each failed read, never throws for a partial read) | `src/clubhouse/data/<slug>.ts` |
| Route entry, flag check, not-on-team/no-team states | `src/clubhouse/routes/<slug>.tsx`, called from the page under `src/app/golf/(dashboard)/dashboard/…` through `isClubhouseFor` |
| Nav: the page shows in Clubhouse only once listed | `CH_REBUILT_ROUTES` in `src/clubhouse/shell/nav.ts` |
| Styles, `.ch-*` classes and `--ch-*` tokens only | `src/clubhouse/styles/<slug>.css` |
| Preview with sample data and every state (`?state=empty\|failed\|partial\|loading`) | `src/app/clubhouse-preview/[screen]/page.tsx`, fixtures in `src/clubhouse/preview/` |
| Mutations go through `useAction` (offline, slow, error toast, haptic, Sentry) | `src/clubhouse/lib/` |
| Each section in its own component inside a `SectionBoundary`, so a crash stays in that section | the screen |

## 4. Catalog every state (gates `states`, `motion`, `accessibility`)

- Give the page the next free page number in `catalog/README.md` and in
  `CATALOG_PAGE` in `scripts/clubhouse/check.mjs`. Pages after the first
  eight use two digits, so the next page's codes look like `CH-09001`. A
  catalog file without a page number fails the check (checked).
- Copy `CATALOG_TEMPLATE.md` to `catalog/<slug>.md` and write one row per
  state: toasts, validation, didn't load, empty, loading, confirm, motion,
  haptic, accessibility.
- Put the number on the element (`data-ch-code`, or the `code` prop of
  `InlineNotice`, `EmptyState`, `SectionBoundary`, toasts and `Modal`). A
  server-side fallback with no element is labelled with a comment naming its
  number.
- Write `src/clubhouse/__tests__/<slug>.test.tsx`, with every test named by
  the numbers it forces. Kinds 0–5 must be used in code and named by a test
  unless the row's test column says `preview` (checked).

## 5. Phone (gates `phone-spec`, `phone`)

Write `phone/<slug>.md` as a native phone design, not a shrunken desktop. It
is built only after the owner marks it `Status: approved`.

## 6. Verify (gates `performance`, `verified`)

    npm run -s typecheck
    npx eslint <changed files>
    npx vitest run src/clubhouse
    npm run -s clubhouse:check
    npm run clubhouse:a11y          # dev server on :3100; add the page and its states to CH_A11Y_PAGES first
    NODE_OPTIONS=--max-old-space-size=8192 npm run build   # when a server surface changed

Then compare the page with the handoff screenshots side by side at 1280px,
log the browser pass in `PROGRESS.md`, and send the owner screenshots. The
flag stays off in production, and deploys are the owner's call.
