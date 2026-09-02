
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

## 2026-08-26 — messaging/announcement sheets stop autofocusing on touch

- SHA: f4216fef8 (+ 596913022 for the sheets).
- Change: FairwayNewMessageSheet search, FairwayTeamBroadcastSheet search +
  group-name, and FairwayCreateAnnouncement's setTimeout title-focus are
  gated on a fine pointer. MessageThreadPane's edit-in-place autofocus is
  intentionally untouched (the user tapped Edit to type).
- Why: on iPhone these sheets opened with the keyboard covering the
  recipient list / the tallest form in the app (owner TestFlight report).
  Desktop type-ahead unchanged.

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

## 2026-08-27 — conversation-rail errors carry their Postgres code, and a team-chat failure no longer reads as an empty inbox

**What changed**

- `useGolfConversations`/`useGolfMessages` stopped wrapping Supabase errors as
  `new Error(err.message)`. That wrapper discarded `code`, `details` and `hint`,
  so the Bridge rendered a blank ERROR CODE for every messaging failure — an RLS
  denial (42501), a statement timeout (57014) and a dropped connection were
  indistinguishable in triage. Three sites now use `toPostgrestError()` +
  `postgrestErrorContext()` from `src/lib/utils/describe-error.ts`.
- The P257 terminal check now reads `(rpcError ?? groupConvsError)`. The
  team-chat query's failure was previously logged and allowed to fall through to
  the "No conversations yet" empty state.

**Why this shape**

- The code goes on `Error.name` because that is the only channel the client path
  has: `/api/log-error` lifts `context.error.name` into `metadata.errorCode`,
  where `incident-report.ts`'s `extractErrorCode()` reads. A context-level
  `errorCode` is read only by `server-error-logger.ts`.
- `details`/`hint` stay OUT of `.message`. `admin_events` fingerprints hash the
  message and `details` carries row-specific text, so folding it in would mint a
  new incident group per occurrence — the fragmentation already documented for
  Cloudflare Ray IDs in `describe-error.ts`.
- No early return at the team-chat site: it supplements the RPC, so returning
  would blank a rail whose DMs loaded fine.

**Expected effect on existing incidents**

Existing incident groups for these three sites re-key once, because `.name`
now participates in the signature. New groups appearing right after this ships
are the SAME failures under a code-bearing identity, not new faults.

**Registry**

`src/hooks/**` was absent from `memory/registry.yml` entirely, so every golf
hook resolved to no feature — `knowledge:map` returned an empty
`impactedFeatures` for the hook owning the whole conversation rail. Mapped
`use-golf-messages.ts` and `use-message-attachments.ts` by name (not
`src/hooks/golf/**`; the other 15 hooks belong to other features). Same class as
the Fairway calendar gap, and it hid for the same reason: `src/hooks` is outside
`GOVERNED_PATTERNS`, so the context guard never tripped either.

**Verified**

`npx tsc --noEmit` exit 0 · `npm run lint` exit 0 · `npm run lint:ratchet` OK
(68 warnings, no regressions) · `npm run knowledge:globs` 0 dead of 465 ·
`npm run knowledge:check` clean · vitest 276 passed across
`src/test/lib/utils`, `src/test/lib/admin`, `client-error-envelope`,
`src/hooks/golf/__tests__` (9 new cases in
`src/test/lib/utils/postgrest-error.test.ts`).

**Not done here**

~47 other `new Error(x.message)` sites remain. Each carries its own
partial-vs-empty decision like the one above; a blanket sweep would be 47
unverified behavior changes. The helpers are the mechanism for fixing them one
verified site at a time.

**Also found, not fixed:** `describeWriteFailure()` emits
`pgCode`/`pgDetails`/`pgHint` into metadata, and nothing in the Bridge reads
those three keys — verified by grep 2026-08-27. Those values are written and
never displayed.
