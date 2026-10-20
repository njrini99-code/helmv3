# INC-2026-10-13 — a `'use server'` object export 500s baseball coach onboarding

- Feature: `baseball_core`
- Also affects: `lift_lab`, `email_outbound`, `observability_sentry` (Bridge mis-tagged the feature)
- Surface: `POST /baseball/coach-onboarding` (server actions `completeCoachOnboarding`, `signupAndCompleteCoachOnboarding`) and every Lift Lab invite action
- Fingerprint: `d9ed17ef` (reliability: `rel:d9ed17ef`, `rel:701e7c24`, `rel:c1e8ed60`)
- Classification: product defect (R1)
- Status: released: 220fe5bab (#2192) is in production 87bd60345 (release:status, 2026-10-15 00:45Z); no d9ed17ef event in the 24h to then. verified_in_production pending a real coach-onboarding completion
- First seen: latent since #1872 (`4674b38e1`); first production occurrence 2026-10-13T20:58:46Z
- Evidence (production, read-only, 2026-10-13T21:50Z): 12 `admin_events` errors 20:58–21:01Z, one real user, statusCode 500; Vercel runtime log `Error: A "use server" file can only export async functions, found object.` digest `874337779@E352`, thrown from the coach-onboarding page's action module graph on `dpl_36khwS4bTrpZjcCKdPFD4bc3B57L` (`86c43bd8`).

## Root cause

`src/app/lifting/actions/invites.ts` is `'use server'` and exported
`export const __testables = { sendInviteEmail }`. Next.js appends
`ensureServerEntryExports` to every `'use server'` module and throws at load on a
non-function export. The coach-onboarding page imports
`@/app/lifting/actions/onboarding`, which imports `./invites`, so every action
POST from that page failed before running.

## Fix

The email leg moved to `src/lib/lifting/invite-email.ts` (`server-only`, not an
action: exporting `sendInviteEmail` from the actions file would have made it a
public endpoint that mails arbitrary addresses). The accept-URL builder's `??`/`?:`
precedence bug (a set `NEXT_PUBLIC_APP_URL` returned the scheme-less
`VERCEL_URL`) is fixed in the move.

Bridge noise fixed alongside: `enrichTraceContext` classified route + message as one
string, so Next's `nextjs.org/docs/messages/…` link tagged this `baseball_messages`.
`classifyTraceFeature` reads the route first.

## Regression tests

- `src/lib/__tests__/use-server-exports.guard.test.ts` — scans every `'use server'`
  module in `src/`; failed on main with exactly `app/lifting/actions/invites.ts: __testables (line 655)`.
- `src/lib/__tests__/error-trace-classification.test.ts` — route beats message.
- Replays: `replay/manifests/use-server-object-export-2026-10-13.yml`,
  `replay/manifests/trace-feature-route-first-2026-10-13.yml`.
