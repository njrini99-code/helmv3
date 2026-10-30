# Fix brief: the two deploy blockers + the DM pair (paste into a Claude Code session in ~/Downloads/helmv3)

From the Clubhouse audit, run 2026-10-29-720962bc4 (lean). Evidence: `~/clubhouse-audit/runs/2026-10-29-720962bc4/` (findings.jsonl, fix-packets/). One PR for all three: they are small, and Nick prefers fewer, larger PRs. Draft PR, local gates first, no deploy of any kind.

## 1. F-0001 (S0, blocks-deploy): the bell shows event times in UTC
- Seen: an event at 10:00 AM Eastern; the event sheet says 10:00 AM, while the bell's "Event updated" line says "Sat, Oct 31 at 2:00 PM".
- Cause: `src/lib/calendar/rsvp.ts:633-649` `formatEventDate()` calls `toLocaleDateString` / `toLocaleTimeString` with no `timeZone`, on the server (UTC on Vercel). It is called from `src/app/golf/actions/calendar-events.ts`, `recurring-events.ts` and `tournaments-calendar.ts`, so the Fairway app is affected too, flags or not.
- Fix: format with the team's time zone (Settings › Team › Team timezone; Demo University Golf is Eastern), e.g. pass `timeZone` into `formatEventDate`. The bigger alternative: store the ISO start in the notification and format it client-side the way the event sheet does. Note that existing notification rows already hold the wrong text.
- Acceptance: move an event to 10:00 AM ET as the coach; the player's bell reads 10:00 AM. Add a unit test for `formatEventDate` with `TZ=UTC`.

## 2. F-0003 (S0, blocks-deploy as a precaution) + F-0004 (S0): direct messages resolve to the Team Channel
- Seen: as the player on phone, New message → To: Coach → Send posts into the 6-member Team Channel. As the coach on desktop, New message → Direct → Jackson Hale → Start conversation closes the sheet and opens nothing (twice). `?player=` deep links fall back to the Team Channel.
- Likely root cause (hypothesis, not verified): `src/clubhouse/screens/messages/Messages.tsx:308`, `startDirect()` reuses `convs.find((c) => !c.group && c.memberIds[0] === userId)`. If the Team Channel isn't flagged `group` in that list and its first other member is the coach (or the target player), the "existing direct thread" is the Team Channel. Match on an exact two-person member set and a direct kind instead. If that is the cause, it is Clubhouse-only, so F-0003 can drop to blocks-flip.
- Also check: `createGolfConversation` (`src/app/actions/messages.ts:749`) for a server-side "reuse a conversation containing both users" lookup. If one exists, it affects Fairway too, and F-0003 stays blocks-deploy.
- Acceptance: player → Coach DM lands in a new 1:1 thread; coach → Start conversation with Jackson opens that thread; the Team Channel gets nothing; the `?player=<id>` deep link opens the 1:1. Add a test for the resolver with a team-channel fixture.

## Rules for the fix session
helmv3 AGENTS.md and Nick's global rules apply: draft PR, no `vercel deploy` (preview included) unless Nick says so in that session, merging only when asked.
