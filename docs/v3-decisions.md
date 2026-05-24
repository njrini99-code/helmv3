# CoachHelm v3 — Locked Decisions

> Quick-reference distillation of [`docs/v3-master-plan.md` Part III](./v3-master-plan.md). When a wave hits an ambiguity, the answer is here 95% of the time. If it isn't, search the master plan; if still not there, ask the human partner before guessing.
>
> **Editing this file requires editing the master plan in the same PR.** Drift between the two is a process bug.

---

## Goals (Part VI)

| Decision | Status |
|---|---|
| One unified primitive called "Goals" replacing focus areas + arcs + drill compliance. | ✅ locked |
| Created by player OR coach. Coach decides per-team whether assigned goals are mandatory or suggested. | ✅ locked |
| Player chooses share-with-coach; **default OFF**. | ✅ locked |
| Window: any duration **7-365 days**. | ✅ locked |
| Stat list **curated** (~20-30 from canonical registry). | ✅ locked |
| Soft cap at 5 active goals — UI warns, doesn't block. | ✅ locked |
| Auto-evaluation at end date: hit / miss / partial / abandoned. System computes; manual decision on what next. | ✅ locked |
| Engine suggests goals from insights + trends; user can also DIY from a stat picker. | ✅ locked |

## Standing Bars (Part VII)

| Decision | Status |
|---|---|
| Universal comparison surface: PGA + team + you. | ✅ locked |
| Cold-start: PGA + You only when team has <5 players with 5+ rounds. Team marker appears as data fills. | ✅ locked |
| Team rank visible to players — honest feedback. | ✅ locked |

## AI / LLM (Part XI)

| Decision | Status |
|---|---|
| Claude writes prose at **exactly 3 surfaces**: round-review summary + key takeaway, hero insight on player dashboard, coach chat. | ✅ locked |
| Coach chat scope: Q&A + can create goals from chat (with confirmation). | ✅ locked |
| Player chat **deferred to v2**. | ✅ locked |
| Weekly recap: deterministic templates with one LLM-composed paragraph. No AI opener on player surfaces. | ✅ locked |
| Existing round reviews NOT auto-rewritten by v3 LLM. Refresh requires explicit user action. | ✅ locked |

## Coach Intent (Part VIII)

| Decision | Status |
|---|---|
| Keep, full version — bubble / maintain / develop / breakout / rehabilitate per player. | ✅ locked |
| Modulates engine alert thresholds via `alert_posture` multiplier on Wave 7 confidence. | ✅ locked |
| **Invisible to player.** | ✅ locked |

## Counterfactuals (Part X)

| Decision | Status |
|---|---|
| Secondary line, not headline. | ✅ locked |
| Auto-suppressed below 0.3 strokes (stat noise floor). | ✅ locked |
| Format: *"Closing this gap → 75.2 → 74.5 avg (≈4 wks)"* | ✅ locked |

## Dropped from Scope

| Item | Reason |
|---|---|
| In-round companion | Year 2 |
| Recruiting sheet | Qualifying workspace replaces as the wedge |
| Drill compliance tracking | Goals' stat movement IS the measure |
| Parent digest | No audience need |

## Audience + Device

| Decision | Status |
|---|---|
| Both audiences ship in lockstep — every feature has coach and player surfaces. | ✅ locked |
| Coach = desktop-first. Player = phone-first. | ✅ locked |

## Ship Order

| Decision | Status |
|---|---|
| Foundation first (W9 → W17), then features. No flashy-first shipping. | ✅ locked |
| Backfill day-one — no empty product at launch. | ✅ locked |

## Notifications (Part XXII)

| Decision | Status |
|---|---|
| Everything ON by default. User opts out per-category. | ✅ locked |
| Quiet mode overrides everything except round-review-ready + coach-assigned. | ✅ locked |

## Infrastructure Providers (revised 2026-05-24 — Task B finding)

| Concern | Provider | Status |
|---|---|---|
| Email | Resend (React Email templates) | ✅ already installed (`resend@^6.7.0`) |
| Push | web-push (Web Push / VAPID) | ✅ already installed (`web-push@^3.6.7`); service worker + manifest + permission ask present; consolidation to `v3/foundation/push.ts` in W9-pt3 |
| Feature flags | GrowthBook (per-coach granularity) | ⬜ install in W9-pt3 |
| LLM | Vercel AI Gateway → Anthropic Claude | ✅ locked (`sonnet-4-6` for round-review + coach-chat, `haiku-4-5` for hero) |

## Architecture

| Decision | Status |
|---|---|
| `engine_version` column on `golf_coach_insights` (added W21) → `'v2'` default, `'v3'` for new generators. | ✅ locked |
| `v3:` signature prefix on all v3-generated insights. | ✅ locked |
| `golf_metrics` real DB table with FK enforcement from goals / standing / genome. | ✅ locked |
| Suggestion engine is its own service, not tied to one cron. | ✅ locked |
| Full v3 generator rewrite with shared `BaseGenerator` base class. | ✅ locked |

---

## Pre-W9 Verifications (resolved 2026-05-24)

| Task | Outcome |
|---|---|
| **A** — W29 qualifying UI scope | Substantial existing UI; W29 builds new v3 route at `dashboard/coachhelm/qualifying/[id]` for selection workspace. Existing `qualifiers/[id]` gets only a "Manage selections" link. See plan Part XV.0. |
| **B** — web-push install state | Installed; Resend also already installed; only GrowthBook needs install. Subscription persistence endpoint to be verified in W9-pt3. |

---

## How to Use This Doc

- **Implementing a wave:** open this doc, search for the decision, work from there. Don't re-derive.
- **Found an ambiguity:** check the master plan first. If genuinely missing, ask the human — never invent a decision.
- **Decision changes:** rare, but if it happens, update both this file AND the master plan in the same PR, with a `Changed:` row and the date.
