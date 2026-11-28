# P001 — Changelog

## 2026-11-28 — The front door sends its signals

```text
Design package: none (Bridge tracking gap: P015 never heard from)
PR/commit: agent/bridge-reliability-issues
Contract IDs: none new
Actions: none new
Data impact: none (no migration; the route and its tables are unchanged)
Held items: none
```

### Changed

- `shell/GateSignals.tsx` (new), mounted by `src/app/golf/layout.tsx`: the
  shell's half of the signals (views, numbered taps, rage clicks, vitals) on
  P015's addresses, which have no shell. Nothing anywhere else, so it never
  runs beside ClubhouseFrame. Off with the `clubhouse_signals` switch.
- Signed out, it holds: what happens waits in memory and nothing leaves the
  browser (the route takes only a signed-in person's signals). A sign-in
  sends it as theirs. Signed in (onboarding, an invitation), it sends as the
  shell does, with the role the account declares or the address is for.
- `shell/use-signals.ts`: a `hold` option for the above; the view a sign-in
  finds already counted on its page is not counted again; only the first
  mount in a document reports vitals, because web-vitals keeps every
  observer it starts and the front door, then the shell, would count each
  vital twice.

### Why

- P015 (sign-in, onboarding, invitations) had no emitter at all: the Bridge
  could not tell a front door that works from one that fails everyone.

### Verification

- `GateSignals.test.tsx`: off with the switch off and on the dashboard's
  pages; holds signed out; sends as the person once signed in; takes the
  invitation's role; every graph page's routes sit under the shell or the
  front door's signals, and both are mounted.
- `use-signals.test.tsx`: holding configures nothing; a sign-in on the same
  page counts one view; the next page counts its own; a vital counts once
  across two mounts.
