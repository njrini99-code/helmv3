# Production audit, 15 Nov 2026: index

Read-only iPhone-width DevTools passes of live Clubhouse (helmsportslabs.com, production build `db3a99ee1`), in the owner's own Chrome 157 with
iPhone 15 Pro emulation (393×852, DPR 3, touch, Safari user agent). Every number is **tier C (Chromium)**, not real Safari or an iPhone
(`.claude/rules/browsers.md`). Nothing was saved, sent, edited or deployed.

| Report | Role | What it covers |
| --- | --- | --- |
| [phone-393/PHONE-DEVTOOLS-FINDINGS.md](phone-393/PHONE-DEVTOOLS-FINDINGS.md) | Coach (Nick, demo team) | 16 findings, worst first: leaving Rounds freezes 1.1 s (4.4 s at 4x CPU), every strip tap blocks 120–190 ms, Home "Add event" runs a route change, the Oct 21 ivory light is gone, Ask scrolls 20 px, Team Hub tabs cut off, duplicate ids, label mismatches; 28 screens, 21 traced flows |
| [phone-393/PHONE-DEVTOOLS-PLAYER-FINDINGS.md](phone-393/PHONE-DEVTOOLS-PLAYER-FINDINGS.md) | Player (Cole, demo team) | 13 findings, worst first: a player's first app open each day records Team Hub's top insight as shown through the prefetch, which CoachHelm's causality attribution then reads; leaving Rounds or Classes freezes 0.4–0.5 s (1.9 s at 4x CPU), New round shows a 3 s mismatched skeleton and writes on open, "Coaches and team" overflows its pill, Notifications shifts 177 px; 16 screens, 22 traced flows, run behind a write guard |

Each finding has its evidence (screenshot, measurement or trace), its cause at `file:line`, and the fix.

- **Raw data** (gitignored): `.helm/audit-runs/prod-audit-2026-11-15/phone-393/`, with screenshots, traces, frame recordings, per-screen probes and
  the player pass's write-guard log (`data/player-guard.jsonl`).
- **Not covered** (both reports say why):
  - views that write when opened on production (CoachHelm, player Team Hub, round review, message threads, Continue round);
  - real safe areas and the iOS keyboard, which need the Simulator or the iPhone;
  - smoothness on a phone (D tier).
- **Corrections for `docs/clubhouse/audit/WRITES-ON-OPEN.md`** (player finding 4):
  - New round writes the live-share level on open (`LiveShareField.tsx:49-56`), not only while tracking.
  - The player Team Hub prefetch write is a product bug as well as an audit hazard (player finding 1).
