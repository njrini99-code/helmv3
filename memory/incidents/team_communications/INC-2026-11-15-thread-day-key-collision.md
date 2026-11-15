# INC-2026-11-15: two day separators in one thread shared a React key

- Feature: `team_communications`
- Surface: Clubhouse Messages thread (`threadItems` in `src/clubhouse/screens/messages/thread/model.ts`, used by `Thread.tsx` and `PhoneThread.tsx`)
- Fingerprint: none in the Bridge (development only). Sentry JAVASCRIPT-NEXTJS-1EH (42 events since 2026-11-04) and -1MG (35 events, 2026-11-15 14:57-15:48Z), environment `development`, `/clubhouse-preview/messages`.
- Status: fix in the desktop health routine PR of 2026-11-15; not yet deployed.
- Risk: R1. Render key only. No schema, RLS, grant, data or copy change.

## What was wrong

`threadItems` pushed a day separator with `key: d<day>` whenever the day
changed from the previous message. When the message list is not strictly
chronological, a day comes back round and a second separator with the same key
is rendered. React warns ("Encountered two children with the same key,
`d2026-10-15`") and may drop or duplicate one of the two children on update.

## Fix

The separator key is `d<day>:<id of the message that opens it>`. It is unique
per item and stays stable while that day's first message is unchanged.

## Proof

- `src/clubhouse/screens/messages/__tests__/thread-model.test.ts`: "gives every
  item a unique React key ..." fails before the fix (3 keys, 2 unique) and passes
  after; "keeps one separator key stable ..." passes on both.
- Replay: `replay/manifests/thread-day-key-collision-2026-11-15.yml`.

## Open

Why the list reached `threadItems` out of order (fixture data in the preview, or
a live append) is not established. If two separators for one day show in
production, that ordering is the next fix.

## Verify in production

After deploy: no "same key, `d20..`" warning from Messages in Sentry.
