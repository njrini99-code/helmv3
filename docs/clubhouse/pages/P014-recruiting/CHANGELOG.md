# P014 — Recruiting: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-30 — Recruiting in Clubhouse (desktop and phone)

```text
Design package: design/handoff/recruiting/ (the owner's canvas "Clubhouse Recruiting", approved 2026-09-30)
PR/commit:      agent/clubhouse (draft PR #2102)
Contract IDs:   140101 to 142001 (53 on this page, all from the catalog; none hand-recorded)
Actions:        9 (ACT-P014-*)
Data impact:    none
Held items:     none
```

- **Issue.** With Clubhouse on, a coach opening Recruiting got the existing page, and the owner's approved boards
  were not built. There was no phone design in the app at all.
- **Fix.** A new page at `/golf/dashboard/recruiting` (coach only), built from the boards on the existing server
  actions: the header, the four-stage pipeline that filters the list (counts and shares of the whole list), search over
  name, hometown, state, email and notes, three sorts, and the open prospect's panel with Email and Call, notes and
  private documents (upload, open, remove). A stage is saved the moment it is picked and goes back, with a Retry, if it
  does not land (CH-14003); delete asks first (CH-14501); every write goes through `useAction`, so offline refuses
  before sending and Retry finishes the whole job. The phone is the boards' phone build: a pushed prospect, and the
  edit form, the stage picker and delete as sheets. In the coach's Team section after Roster. With the flag off the
  existing page is unchanged; a player is still sent Home.
- **Checked.** Recruiting tests 61 of 61 and all of `src/clubhouse` 1531 of 1531; 32 deliberate breaks of the guarded
  code, all caught and restored; `typecheck:fast` and eslint clean; axe at 1280, 390 and 430 (40 scans) and the
  native-feel scan clean (VERIFY.md). `clubhouse:check` passes once `registry.mjs sync` has minted the 53 IDs.
- **Not checked.** A real coach session, the build, the iPhone (VERIFY.md).

### Added

- The page: `src/clubhouse/screens/recruiting/` (`Recruiting`, `RecruitingView`, `RecruitingDesktop`,
  `RecruitingPhone`, `Pipeline`, `Documents`, `ProspectForm`, `RecSheet`, `parts`, `writes`, `ctx`,
  `RecruitingSkeleton`, `RecruitingNoTeam`), the loader and pure rules (`data/recruiting.ts`,
  `data/recruiting-shape.ts`), the route (`routes/recruiting.tsx`) and `styles/recruiting.css` (`.ch-rec-*`,
  `.ch-recm-*`).
- 53 catalog states, CH-14001 to CH-14914 (`docs/clubhouse/catalog/recruiting.md`), each named by a test except the
  two motion rows; the manifest, the six page docs, the phone spec and the screen checklist.
- The preview at `/clubhouse-preview/recruiting` with its states (empty, nomatch, failed, loading, sparse, noteam,
  detail, add, edit, delete, docsfailed, failwrites, failstage, slow), in `a11y.mjs`.

### Changed

- The page and its `loading.tsx` render Clubhouse for a coach with the flag on; the sidebar lists Recruiting in
  Team after Roster, and the route is rebuilt for coaches only (`shell/nav.ts`, `shell.test.tsx`).
- `controls.css`: on the phone a menu's rows are 44px tall, and the search's Clear button has a 44px hit area (both
  found by the native-feel scan on this page; shared, so every page gains them).
- `memory/features/recruiting.md` and `memory/registry.yml`: the Clubhouse surface, code and test.

### Why

- The owner approved the boards (Q-87, launch scope: Recruiting is the one screen rebuilt beyond the earlier boards).
  D-64 (motion), D-66 (navigation), D-69 (every category answered), D-70 (haptics) and D-71 (page empty state) apply.

### Open

- Eight questions for the owner about what the boards do not draw (DESIGN.md, "Not on the boards"): the upload
  dialog, removing a document, the no-team page, an empty stage, Add on the phone, film, pronouns and a remembered
  filter.
