# Shell silent errors — Changelog

## 2026-11-17 — Swallowed failures are reported

```text
Design package: none
PR/commit: agent/ch-silent-errors-rest
Contract IDs: none
Actions: none
Data impact: none (reporting only)
Held items: none
```

### Changed

- `Bell.tsx`: a team switch that throws while opening another team's item is
  reported (`shell.bell`, switchTeam); the toast is unchanged.
- `discard-round.ts`: a discard that throws is reported (`shell.resume`, low
  when offline), and so is a failed delete of this device's offline copy.
- `OfflineSync.tsx`: a whole sync pass that fails, and an engine that does not
  start, are reported (`offline-sync`, low). The banner is unchanged.
- `quick-chat/earlier-today.ts`: the chat list and thread reads behind "Earlier
  today" and the restored thread report a refused or failed fetch
  (`shell.quickChat`); the block still stays out and the thread still starts
  fresh.
- `use-warm-inbox.ts`: an inbox warm-up that throws is reported
  (`shell.warmInbox`, low).
- `BrandWord.tsx`, `command/recent.ts`, `quick-chat/qc-team.ts`,
  `quick-chat/useQcMotion.ts`, `relink.ts`: a one-line comment on each catch
  that is not an error (storage, a cancelled animation, an unparseable address).

### Why

- The owner asked to "just fix the errors" (2026-11-17): a failure the screen
  swallowed now reaches Sentry, error_logs and Bridge, tagged ui=clubhouse, so
  it can be seen and ranked.

### Verification

- `npx eslint` on the changed files, `npm run typecheck:fast`, and
  `npx vitest run` on the tests that import them.
