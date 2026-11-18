# 2026-11-17 — Silent errors reported (screens-a)

## 2026-11-17 — Messages failures that were swallowed now reach error tracking

```text
Design package: none
PR/commit: branch agent/ch-silent-errors-screens-a
Contract IDs: none
Actions: none
Data impact: none (reporting only)
Held items: none
```

### Changed

- A thrown read in the announcement detail, the Add members list, a
  conversation's files, message search and a photo tile is reported with
  `chReport` (tag ui=clubhouse); each keeps its existing failed notice.
- The rail's refresh after a send, edit, delete or link, a document's signed
  link, a file's open, the retry of an unconfirmed attachment send and the
  composer's check for one are reported when they throw.
- Reads that drew nothing on failure (attachment sizes, the mute glyphs,
  server pins) and pin writes that reverted with no toast are reported.
- The private typing channel's auth and join failures are reported.
- A failed copy of a message is reported (low).
- Storage helpers that fail quietly by design carry a one-line comment.

### Why

- The owner asked to fix the errors: every swallowed failure in Clubhouse is
  reported through the existing pipeline. Nothing the coach sees changes.

### Verification

- Typecheck, eslint on the changed files, and the Messages vitest suites.
