# 2026-11-07 — P013

## 2026-11-07 — Ask v2 gap pass: new reads, the save card, and motion the drafts were missing

```text
Design package: design-refresh/ask (page redesign/coachhelm-ask.html; the owner's latest differs from the committed copy only in its document wrapper)
PR/commit:      agent/ch-ask-v2
Contract IDs:   none new
Actions:        coachhelm-ask-artifacts.ts: saveAskArtifact returns the saved id, undoAskArtifact is new
Data impact:    reads golf_event_attendance, golf_practice_sessions, golf_practice_plans (held; absent is handled), golf_documents (titles and folders), golf_coach_insights (team patterns)
Held items:     none applied, none written; HM1 to HM4 stay held, folders stay free text on golf_documents.folder
```

The survey is `docs/clubhouse/ask-v2/GAP.md`.

### Changed

- Ask reads practice (practices held, plans, sessions players logged), Documents
  (titles and folders, never contents) and, where the Board shows team patterns,
  what several players share. The calendar read names who replied and who is in
  class during each event. Every read has its own step line and chip name.
- "What Ask can see" in the settings sheet lists Documents and the wider calendar
  and practice reads, and no longer says Practice waits on a tab.
- Save draft on a report, lineup or recap is the design's docked save card: the
  folder list opens in the card, New folder is a name field, the page drops into
  the folder, and the receipt keeps Undo for 8 seconds. Undo removes the draft
  (and a folder it emptied). The practice plan keeps its own Save row.
- Follow-ups rise together under a finished answer, the jump key arrives with a
  fade, and the task ring, trip route, note, lineup, board and poll drafts have
  their entrances. Each has a Reduce Motion fade and nothing under Animations off.
- Literal second durations in Ask's stylesheet moved to the duration tokens, so
  Animations off now silences them.

### Why

- The owner's page lists nine areas Ask can see; three had no read and the
  calendar had no replies or classes.
- Save draft was a sheet with a select and a toast: no receipt and no Undo, where
  every write goes confirm, commit, receipt with the 8 second Undo.

### Verification

- Source and unit tests only. No browser, phone or screenshot check was made, so
  no VERIFY row is added. The coordinator's click-through list is in the report.
