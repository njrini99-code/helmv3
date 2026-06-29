# Agent D: email invites — DONE

## Fixes
- `src/app/golf/actions/golf.ts:2493-2589` — `invitePlayerToTeam` now actually sends the invite email when an `email` argument is provided. Renamed `_email` -> `email`, added a `full_name` column to the coach select (used as the "from" name in the email body), and after the join code is generated, fired a non-blocking async send via the new `sendTeamInviteEmail` helper. Failures are caught + logged at `warning` severity through `logServerError`; the function still returns the `inviteCode` and `inviteLink` exactly as before, so existing callers and the copy-link UI are unaffected. Empty / invalid emails skip the send (no throw, no error).
- `src/lib/email/team-invite.ts` (new) — fire-and-forget invite email helper. Mirrors the `coach-digest` pattern: lazy `getResendClient()` from `src/lib/email/resend-client.ts`, returns `{ sent, skipped, reason, messageId }` with no throws on Resend errors. Includes `isValidEmail()` shared validator, brand-matching HTML shell (cream body / dark warm header / green CTA), HTML-escaped interpolation, and a fallback "join code" callout for cases where the button doesn't work. Subject line: `You've been invited to join {teamName} on GolfHelm`. From-address: `Helm Sports <invites@helmsportslabs.com>` (overridable via `RESEND_TEAM_INVITE_FROM`). Accepts either a path-only `joinUrl` or an absolute URL — if path-only, prefixes with `NEXT_PUBLIC_APP_URL`.

## Email helper used
- New wrapper: `src/lib/email/team-invite.ts` -> `sendTeamInviteEmail()`
- Built on the existing wrapper: `src/lib/email/resend-client.ts` -> `getResendClient()` (the same lazy singleton the coach digest uses; not a direct `new Resend(...)`)
- `src/lib/email/team-invite.ts` is loaded via dynamic `import('@/lib/email/team-invite')` inside `invitePlayerToTeam` to keep the change strictly scoped to the function body — no top-of-file imports were added to `golf.ts`.

## Why a new helper instead of `sendEmailNotification`
- `src/lib/notifications/email.ts:sendEmailNotification` requires a `recipientId` (user UUID) so it can look up the user's `notification_preferences` row in `users`. Invite recipients are by definition NOT yet users in our DB, so that path is wrong for this case. The new helper bypasses prefs (the recipient explicitly opted in by being invited by their coach) and otherwise reuses the same brand tokens, font stack, and shell layout as the existing notification templates.

## Behavior summary
- `email` empty / whitespace -> skip send, return URL (existing behavior preserved).
- `email` fails `isValidEmail` -> skip send, return URL.
- Resend not configured (`RESEND_API_KEY` unset) -> `getResendClient()` returns `null`, helper returns `{ sent: false, skipped: true, reason: 'resend-not-configured' }`, return URL.
- Resend send throws or returns an error -> `logServerError` at `'warning'` severity (action: `email.sendTeamInviteEmail`, featureArea: `team-invite`), helper does NOT throw, return URL.
- Any unexpected exception inside the IIFE -> caught and logged via `logServerError` at `'warning'` severity (action: `golf.invitePlayerToTeam`, featureArea: `team-invite`).

## Verification
- `npx tsc --noEmit` for `src/`: clean (zero errors). Pre-existing `helm-vid/**` and `.next/types/validator.ts` errors are unrelated to this change and were present before.
- File ownership respected: only `src/app/golf/actions/golf.ts` (lines 2493-2589, the `invitePlayerToTeam` body — no other functions touched, no top-level imports added) and `src/lib/email/team-invite.ts` (new file in owned dir) were modified. `RESEND_SETUP.md` read-only, untouched.
