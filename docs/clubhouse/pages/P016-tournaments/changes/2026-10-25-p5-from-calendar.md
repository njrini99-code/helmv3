# 2026-10-25 — Tournaments: P-5 additions (tournaments from the calendar)

```text
Design package: P-5 build plan, 4.11 and 8.7; changelog 2026-10-25, P-05
PR/commit:      claude/clubhouse-tournaments-from-calendar
Contract IDs:   CH-16050 to CH-16053, CH-16253, CH-16352, CH-16550,
                CH-16551, CH-16650, CH-16850 (CH-16310 retired)
Actions:        setTournamentCancelled, untrackTournament
                (src/app/golf/actions/tournaments-calendar.ts)
Data impact:    reads only; the writes need held 20261025040000
Held items:     docs/clubhouse/held/data/tournaments-from-calendar.md
```

## Changed

- The desk gains a tournament menu: Cancel tournament (asks CH-16551, shows at
  once, written when its Undo runs out), Restore tournament (at once,
  CH-16052) and Stop tracking (asks CH-16550; with scores entered or results
  official it says why it stays tracked instead).
- The season home's first run starts on the calendar (CH-16352, replacing
  CH-16310): Add a tournament opens the calendar editor on Tournament; the
  secondary plans from here, or points at Set up from calendar.
- Set up from calendar lists this season's untracked tournament events,
  consecutive days of one name as one row; a row opens the calendar editor on
  its first day with Track on (`?event=<id>&setup=1`). A failed read says so in
  place (CH-16253).
- Next season's events fold into "Next season · 2027–28 (n)" at the end of the
  ledger; the next-event card still looks across the boundary.
- A tournament made today carries "Set up today"; one that arrives while the
  page is open (useSeasonHomeLive follows `golf_events`) takes the changed wash
  once (CH-16650) and is said once (CH-16850). Nothing moves on first paint.

## Not yet

- A group row adopts only its first day as R1 when opened; the other days stay
  calendar entries until set up (the RPC can adopt them; the editor doesn't
  pass them yet).
