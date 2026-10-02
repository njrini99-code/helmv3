# Clubhouse release candidate — 2026-10-02

Candidate: `codex/clubhouse-design-fidelity`,
[PR #2121](https://github.com/njrini99-code/helmv3/pull/2121).
The PR head and its check results identify the exact candidate. This document
records release preparation; it does not authorize a merge or deployment.

## Result and scope

The supplied designs govern the repaired mobile presentation. Green and ivory
remain; Messages follows the owner’s Apple Messages display and interaction
reference. Cards and bubbles regain layered material, phone layouts gain space,
sign-in keeps course artwork visible, and arrival frames the animated golf hole.
All-day events display dates. Missing data remains visibly unknown or absent.

Messages additionally preserves the reader’s position while the composer or
viewport resizes. An attachment request uses stable message and attachment IDs.
A lost response retains the exact uploaded request through a same-tab reload;
Retry confirms or completes it without sending a second message. A partial
attachment failure retains only unsaved files, without resending delivered text.
Recovery is scoped to the authenticated user and conversation and clears with
logout. No migration, RLS relaxation or production data write is included.

## Evidence

- Coach and player signed in with real passwords against a disposable local
  Supabase database. WebKit observed the welcome route, golf hole, camera push,
  moving ball, dashboard and Messages for both roles.
- A text message, quoted reply and quoted photo committed exactly once. Both
  authenticated sessions read all three under participant RLS. The recipient
  downloaded the signed photo: 25,327 bytes. No settled page errors occurred.
- The local report is `/tmp/helm-clubhouse-local-flow/report.json` with role
  screenshots alongside it. These are local artifacts, not production evidence.
- WebKit phone layouts, reply gestures, multiline input, reduced motion,
  composer resize and preserved older-reader position have scoped evidence in
  page VERIFY logs. The local gallery is
  `.helm/screenshots/clubhouse/GALLERY.html`.
- A second local WebKit report,
  `/tmp/helm-clubhouse-local-recovery/report.json`, records two responses lost
  after commitment, a page reload and explicit Retry. All three requests used
  the same IDs; read-back remained one message and one attachment. The pending
  marker cleared only after confirmation, and the recipient could read the photo.
- Settled 390px WebKit recovery geometry stayed within the viewport. A
  150-character unbroken filename exposed chip overflow; its scoped wrap fix
  keeps the chip and composer bounded. Forty-one captures pass screenshot
  registry checks.
- Focused action, hook and UI tests exercise refusal, partial completion,
  unknown outcomes, duplicate replay, authorization, logout and storage denial.
  Final focused checks passed: 61 backend/recovery cases, 92 Messages/audit/
  anchor cases and 144 Hub cases. Scoped ESLint, 67 Clubhouse tooling tests,
  knowledge/generated checks, Markdown ratchet and whitespace checks passed.
- Final production build exited 0: compiled in 119s, TypeScript finished in
  11.7s, all 181 static pages generated and the route table emitted. The PR
  records the exact pushed head and its GitHub check results.

## Release conditions

The release remains blocked until the candidate’s checks are green and the
owner accepts the phone experience and rollout plan. Physical iPhone Safari,
VoiceOver and device frame timing have not been verified on this host; desktop
WebKit is supporting evidence, not that acceptance.

Production was read on 2026-10-02 through `release:status`:
`ef6e017a24d5417cf866e0651a4b7a7835930b5d` served at
`https://helmsportslabs.com`; `origin/main` was
`cbc1c0d1b7b4111fb9fc5ebbcd9e7263dd45a4c5`, three commits ahead.
The routine weekly deployment allowance was **2 of 2 used**, including an
attempted deployment. An additional release requires an owner budget decision.

`golf_clubhouse_ui` and `golf_clubhouse_front_door` remain off in production.
`HELM_CLUBHOUSE_TEAMS` provides the server-side team allowlist; rollout scope is
pending the owner’s decision. A public front-door flag applies globally, so a
team canary must not be described as a per-team sign-in rollout.

The existing complete-swap audit still names owner-held database work and phone
acceptance. Consult [SWAP_AUDIT.md](SWAP_AUDIT.md) and
[HELD.md](../../supabase/migrations/HELD.md) before enabling Clubhouse broadly.
In particular, qualifier reasoning isolation, round-submit version checks and
stats/cache corrections must be reconciled with the approved rollout. This PR
does not discharge those holds or claim product-wide completeness. Weather and
season-week figures still lack a real source and remain absent.

Message notification fanout remains best effort. Confirmed fresh writes schedule
it once; confirmed replay suppresses another fanout. A process dying before its
post-response callback is an existing delivery boundary; no durable outbox is
introduced here.

## Owner release path

1. Review and approve the exact green PR head and the phone result.
2. Decide the team allowlist, front-door behavior, required held migrations and
   deployment budget. Apply only reviewed, merged SQL through the documented
   production apply path, then verify its schema and data results.
3. Request the merge through `npm run pr:land -- 2121`. Production release uses
   `scripts/deploy-prod.sh` from clean, current canonical `main`, linked to
   Vercel project `prj_qPgC4eErTUsaSmv40EiQMNuTpuEV`.
4. Verify `npm run release:status` reports the approved served SHA, then run
   authorized coach/player acceptance against the selected rollout teams.
5. If acceptance fails, request rollback or promotion explicitly. Restore the
   prior approved deployment or disable the approved flags through the release
   path; never treat a source push as a rollback of the served application.
