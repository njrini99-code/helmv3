# Supabase Edge Functions

## Editing a function here does not change production

Edge functions are **not** part of any deploy this repo performs. They are not
built by Vercel, not touched by a merge to `main`, and not covered by the
manual production promote. The only thing that changes what runs is:

```bash
supabase functions deploy <slug> --project-ref qmnssrrolpinvwjjnufo
```

This has already caused one real defect. PR #1096 (2026-07-29, "native
Capacitor polish — haptics, push registration, APNs") rewrote
`send-apns-push` and updated its caller in `src/lib/notifications/push.ts` to
match the new response contract. The function was never redeployed, so
production kept serving the 2026-04-07 build, and two fixes from that PR have
never been live:

- `apns-expiration: 0` — APNs reads this as "deliver once, right now, discard
  on failure", so every push to a phone that was off, asleep, or out of signal
  was silently dropped. The committed version sends an absolute deadline
  (default 24h) so APNs retries.
- `shouldDeactivateToken` on 410/400 — `push.ts` has a branch that reads this
  flag to retire a dead device token. The deployed build never sets it, so
  that branch has never run and dead tokens accumulate `failed_count` forever.

## Before deploying `send-apns-push`, check `APNS_ENVIRONMENT`

The host is chosen from `APNS_ENVIRONMENT`. It now **defaults to production**
and takes `development` to opt into the sandbox host. Between #1096 and
2026-08-01 the committed source had this inverted (`=== "production"`, i.e.
sandbox unless told otherwise) while the deployed build defaulted to
production — so deploying without setting the variable would have moved every
send to the sandbox host, which rejects production device tokens with
`BadDeviceToken`.

A token is only valid against the host matching the build that minted it:
debug/simulator builds → sandbox, TestFlight and App Store builds →
production.

## What is actually deployed

As of 2026-08-01 the project has four ACTIVE functions, and **two of them have
no source in this directory**:

| slug | source here | note |
| --- | --- | --- |
| `send-apns-push` | yes | deployed build is stale — see above |
| `personalize-email` | yes | in sync |
| `create-admin-user` | **no** | unauthenticated; see #1175 |
| `verify-emails` | **no** | see #1175 |

Anything deployed but absent here cannot be reviewed, linted, secret-scanned,
or reasoned about from the repo. If you deploy a function, commit it here in
the same change.

`process-task-reminders` used to live here; it was never deployed and never
invoked, and was removed 2026-08-01.
