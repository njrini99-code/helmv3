
## 2026-08-26 — attachment send no longer blocks on notification fan-out

- SHA: pending commit on fix/message-attachment-fanout-after.
- Change: `sendGolfMessageWithAttachments` moves its email/push/in-app
  fan-out into `after()`; the sender's response returns as soon as the
  message, attachment rows, and conversation bump are durable.
- Why: on a 13-participant team chat the inline fan-out (one email + one
  push edge-function call per recipient) pushed the action past what
  mobile Safari would wait for. The response was lost and the composer
  reported failure for sends that had fully landed — observed live
  2026-08-26 (Guilford coach, same photo posted three times, told it
  failed each time; zero server-side errors in Sentry). Same
  response-loss class the round submit already fixed, same after() idiom.

## 2026-08-26 — Announcements: direct file upload in the composer

- **What**: `FairwayCreateAnnouncement` gains an Upload control in its
  Attachments section, wired to the Documents pipeline
  (`uploadGolfDocument` → `createGolfDocument`) so a coach can attach a
  photo/file straight from the device; the uploaded file lands in the team
  document library and auto-attaches to the announcement via the existing
  `documentIds` → `golf_announcement_documents` path. The Attachments
  section previously rendered only when the team already had library
  documents — a team with zero documents saw no attach affordance at all,
  which a coach reported as "can't attach it in the announcements tab".
  `teamId` is now threaded page → list → composer;
  `createGolfDocument.uploaded_by` became optional (server always uses the
  authenticated user; the param was ignored).
- **Why**: production user report (Guilford coach, 2026-08-26) — second half
  of the message-attachments incident.
- **Verified**: typecheck 0, lint 0, focused vitest 20/20
  (announcements + team-hub parity), production build.
- **SHA**: (branch `fix/announcement-direct-upload`, PR pending)
