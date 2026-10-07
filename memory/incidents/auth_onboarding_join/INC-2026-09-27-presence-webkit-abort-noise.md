# INC-2026-09-27: WebKit's aborted presence heartbeat opened Bridge incidents per route

- Feature: `auth_onboarding_join`
- Surface: every authenticated golf route (usePresence runs in the dashboard layout); observed on `/golf/dashboard/rounds/new` and `/golf/dashboard/my-qualifiers` in the iOS app (WKWebView)
- Status: FIX IN PR #2082 (agent/health-20260927-1147); production 6ee77e98 as of 2026-09-27 22:00Z
- Risk: R1. Client log filter only. No schema, RLS, grant or behaviour change.
- Signal: Bridge fingerprints `d07955ca`, `c6a3835e` (and sibling `02987d96`), message `Presence heartbeat RPC failed: msg=AbortError: Fetch is aborted hint=Request was aborted (timeout or manual cancellation)`, 2026-09-27 15:26Z to 19:43Z, one event each.

## What was wrong

`isPresenceHeartbeatTimeout` in `src/hooks/use-presence.ts` recognised only
Chrome's wording of supabase-js's request deadline (`TimeoutError: signal timed
out`). WebKit words the same aborted fetch `AbortError: Fetch is aborted`, so
it fell through to `logError`, and because the fingerprint includes the route
each page minted a new Bridge incident for a best-effort heartbeat that the
next interval retries.

## Fix

The matcher also accepts `AbortError: Fetch is aborted` and `Request was
aborted (timeout or manual cancellation)`. Everything else (for example a
42501 from an expired JWT) is still reported.

## Proof

- `src/hooks/__tests__/use-presence.test.tsx`: the new WebKit test fails on
  origin/main 82420866a (logError called once) and passes with the fix; the
  16 existing tests pass unchanged.
- Replay: `replay/manifests/presence-webkit-abort-2026-09-27.yml`.

## Verify in production

After deploy: no new `Presence heartbeat RPC failed: msg=AbortError` rows in
admin_events; `d07955ca`, `c6a3835e` stay quiet for 24h.
