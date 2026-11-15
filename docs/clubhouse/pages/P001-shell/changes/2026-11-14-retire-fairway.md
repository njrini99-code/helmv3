# 2026-11-14 — shell

## 2026-11-14 — Clubhouse is the only shell

```text
Design package: none (owner decision 2026-11-14: "No allowlist, complete replacement of fairway")
PR/commit:      agent/retire-fairway
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `src/app/golf/(dashboard)/layout.tsx` always draws `ClubhouseShell` and
  tags the request `ui=clubhouse` (`tagClubhouseRequest`, `gate.ts`); the
  Fairway shell, the `golf_clubhouse_ui` flag and the `HELM_CLUBHOUSE_TEAMS`
  allowlist are gone. `isClubhouseFor` is a role check.
- The dashboard loading, template and not-found draw Clubhouse only;
  `ClubhouseSwitch` is deleted.
- Old addresses one place for both roles (tasks, announcements, documents,
  travel, my-qualifiers, rounds/[id]/review) are `next.config.mjs` redirects;
  `CH_ALIASED_ROUTES` and `CH_DASHBOARD_SEGMENTS` (`shell/nav.ts`) drop them.
  Role-dependent aliases keep their layout redirect over a page that draws
  nothing.
- `shell/OfflineSync.tsx` registers `public/sw.js` and turns the worker's
  Background Sync message into a sync pass (only Fairway did before).

### Why

- The owner retired Fairway's coach and player screens on 2026-11-14:
  Clubhouse is the only UI, for every team.

### Verification

- `shell.test.tsx`, `alias-frame.test.ts`, `alias.test.ts`, `gate.test.ts`,
  `gate-sentry-tag.test.ts`, `offline-sync.test.tsx`,
  `route-loading-shell.test.tsx`.
- Not checked in a browser or on a device in this change.
