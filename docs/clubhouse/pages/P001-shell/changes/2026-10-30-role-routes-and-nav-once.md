# 2026-10-30 — Shell: role-aware routes and one navigation per tap

## 2026-10-30 — Unknown addresses, old aliases, player parameters and double taps (F-0025, F-0026, F-0055, F-0056, F-0066)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0025, F-0026,
                F-0055, F-0056, F-0066; fix plan PR 6)
PR/commit:      claude/audit-fix-06-shell-nav (#2417)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- nav.ts: CH_ALIASED_ROUTES is role-aware (isAliased(path, role)), and
  CH_DASHBOARD_SEGMENTS with isKnownDashboardPath tells an address that is not
  a page from one not rebuilt yet. ClubhouseFrame renders an unknown dashboard
  address as CH-1306 ("We couldn’t find that"), not CH-1301 "hasn’t been
  rebuilt yet" (F-0025), and sends an old alias on at once instead of a blank
  "Opening…" (F-0055).
- nav.ts: CH_COACH_ONLY_PARAMS (Stats and CoachHelm player, the Rounds course
  player) and withoutCoachParams; a player who opens a coach address is
  replaced onto it without the coach parameters (F-0066). The CoachHelm
  qualifying layout sends a player to their own target instead of an empty
  heading (F-0056;
  app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/layout.tsx).
- ClubhouseFrame uses useNavOnce: a second tap on the same link within a
  second is dropped before Next’s Link sees it, so a quick double tap pushes
  once (F-0026).

### Why

- The audit found double pushes, the wrong empty state on mistyped addresses,
  a blank alias hop and coach parameters left on a player’s address.

### Verification

- nav-role-routes and nav-once tests (new) red on main, green after;
  shell.test gains a CH-1306 case (zz-x) and an F-0066 case, and uses
  /dev/haptics where it used /lineups (not a real segment); alias-frame
  updated.
