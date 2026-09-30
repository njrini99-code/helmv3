# P009 — Qualifiers: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-30 — V2 page docs (contracts proven by tests); Retry now finishes the job

```text
Design package: design/handoff/ v2 (Coach - Qualifiers.html, Coach - Qualifiers - Mobile.html)
PR/commit:      agent/clubhouse (working tree, not yet committed)
Contract IDs:   90101 to 92401 (122 on this page: 77 from the catalog, 45 new behaviour contracts without a code)
Actions:        12 (ACT-P009-*)
Data impact:    none
Held items:     qualifier-squad-and-entrants (feature), qualifier-db-hardening (data)
```

### Changed

- The six page docs, the manifest's actions (12, each mapped to its component, handler, server action, tables and
  contracts), `status.contract` complete and `docs` current, and the manifest's `/qualifiers/[id]/selection` route.
- 45 behaviour contracts for what the catalog does not number: the core views and addresses (90101 to 90107), the
  live refresh (90304), the edit form's locks (90513, 90514), offline refusal of all eight writes (90702), the
  permission rules (90803 to 90812), success (90901, 90902), state kept (91202 to 91204), no optimistic writes
  (91301), Retry and Try again (91401, 91402), the re-read after a write (91501), field alerts (91804), the phone
  views (91901 to 91904), keyboard (92001 to 92003), one-pass reads and the debounce (92101, 92102), reporting
  (92301 to 92304) and the tests (92401). They are in a sidecar until the registry sync merges them into
  `bridge-contracts.json`.
- Category 08 (permission) is real: the coach-only addresses, what a player sees, the loaders' team ownership, the
  server gates behind each write, and what a refusal says. The open RLS gap (a player's database access to
  teammates' holes and, until D-35 is applied, to pick reasons) is stated in the contract.
- The catalog rows CH-09309, CH-09310 and CH-09311 (no team, not found, coach only) are now forced by tests, not
  marked preview.
- Tests: `qualifiers.test.tsx` 65 → 104; new `qualifying-coach-gate.test.ts` (6, 90810); `qualifier-setup.test.ts`
  and `golf-qualifier-manual-close.test.ts` gain Bridge IDs (90811, 92302) and a test (90812). Every hand contract
  is named by its Bridge ID in a test title; nothing was weakened or removed.
- `docs/clubhouse/screens/qualifiers.md`: the live-updates row now describes the hook that was built (one channel,
  `golf_rounds`), not the three-table channel the first plan named.

### Fixed

- Retry on a failure toast re-ran only the write. Closing the question, changing the status pill, opening the new
  qualifier and reading the page again lived in the button, so a retry that landed left the page as it was. The
  follow-up now lives inside each action (Close, Reopen, Create, Save, Start selecting, Save pick, Remove pick,
  Confirm squad). One test drives all eight and fails with the fix taken out (checked).
- The phone's closed note for a coach now carries the rule the desktop and the catalog state (players cannot enter or
  submit rounds in a closed qualifier, including rounds already started; CH-09901).

### Why

- D-62: Messages is the gold standard the other pages copy. D-69: every category answered.

### Verification

- The four Qualifiers test files, 130 of 130. 73 deliberate breaks of the guarded code, all caught, all restored.
  `npm run -s typecheck:fast` and eslint on the changed files clean (VERIFY.md).
- Not run in this pass: `clubhouse:check`, `docs:check`, the build, a browser or the iPhone.

## 2026-09-30 — v2 phone and Manage selections

- The phone: list under a "‹ More" top bar, `QualifierDetailPhone`, the player rounds sheet, the form with Cancel and
  Create in the top bar, and Manage selections (`/qualifiers/[id]/selection`, coach only, Q-65) on the live
  selection actions. New catalog rows CH-09005 to CH-09008, CH-09111, CH-09112, CH-09218, CH-09219, CH-09315,
  CH-09316, CH-09408, CH-09503 to CH-09505, CH-09703 and CH-09903 (PROGRESS.md).

## 2026-09-29 — Desktop build

- Coach and player list, detail, create and edit on the existing qualifier server actions (D-30), the v2 motion and
  haptics (D-64, D-70), and the D-61 gate on the squad-size and entrants actions.
