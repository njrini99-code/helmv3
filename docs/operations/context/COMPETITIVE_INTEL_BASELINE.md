# Helm Competitive Intel Baseline

> Purpose: A single, partner-readable competitor map for Helm Sports Labs (GolfHelm + BaseballHelm), grouped by market. It seeds the Huly "Competitive Intel" space and gives n8n/Greptile a stable reference for "who do we compete with, and where is our edge?"
>
> Ground truth: [docs/business/06-competitor-positioning.md](../../business/06-competitor-positioning.md) (golf) and [docs/business/07-baseballhelm-context.md](../../business/07-baseballhelm-context.md) (baseball). Deeper golf research: [docs/v3-research-competitive-landscape.md](../../v3-research-competitive-landscape.md).

## How to read this doc (provenance legend)

The repo does **not** treat both sports the same way, so neither does this doc:

| Tag | Meaning |
|---|---|
| **Repo-grounded** | Claim traces to [docs/business/06-competitor-positioning.md](../../business/06-competitor-positioning.md). GolfHelm is the only product in-repo with a researched, named competitive set. |
| **Interop-only (repo)** | Named in-repo purely as a stats/import interoperability target, **not** a head-to-head competitor. Applies to GameChanger, StatCrew, PrestoSports, SIDEARM/NCAA XML per [06 §4](../../business/06-competitor-positioning.md) and [07 §5](../../business/07-baseballhelm-context.md). |
| **Analyst-estimate (unverified vs repo)** | External/general-market knowledge. The repo does **no** baseball competitive positioning, so all baseball threat levels below are analyst estimates, not repo facts. Do not cite these as company positioning. |

Threat = threat to Helm's ability to win/keep a college program, not company size.

---

## Group 1 — Golf (repo-grounded)

The research directive is explicit: **do not try to out-stat Clippd, out-coach them** ([06 §2](../../business/06-competitor-positioning.md)).

| Competitor | What it is | Overlap with Helm | Key strengths | Weaknesses / gaps | Helm's edge / opportunity | Threat |
|---|---|---|---|---|---|---|
| **Clippd** | Performance-analytics platform **and** official NCAA scoring/rankings authority (contract since Oct 2023; "Scoreboard powered by Clippd" layered on in 2024). 200+ college programs as of 2025-2026. | Direct — same buyer (college golf programs), same analytics + coach-portal surface. | Two proprietary 0–200 metrics (Shot Quality, Player Quality/CASE); "What To Work On" practice priorities; official Scoreboard is the de-facto NCAA college-golf homepage. | Manual entry without Arccos/Garmin hardware; SG "hard to interpret"; Advanced Analytics locked behind Pro tier; no Smart Scheduler on Scoreboard Standard; Coach Portal "first release." | No conversational/LLM layer, not goals-aware, no outcome causality, coach-player = comment threads. Helm's wedge is the coaching layer, not the stat layer. Running NCAA scoring infra distracts them from the coaching product. | **High** (PRIMARY THREAT) |
| **DECADE (Scott Fawcett)** | Course-management methodology (Distance, Expectation, Correct Target, Analyze, Discipline, Execute) via video, yardage books, app, Combines. 1,000+ college players, 50+ Tour pros. | Peer, not incumbent — mental-model + PRACTICE Rx overlaps Helm's goals/practice loop. | Trusted vocabulary many Helm coaches already teach; $1,499/team/yr (cheaper than Clippd); PRACTICE Rx ($199) auto-generates practice plans. | PRACTICE Rx is drill-library-driven, not goals/cadence/outcome-causality-driven; not a live analytics/workflow platform. | Speak DECADE vocabulary in narrative/insight copy (start lines, expected zones, OB%, doubles); wire goals→cadence→outcome instead of a static drill library. | **Medium** |
| **Arccos Caddie** | Club-grip sensors: auto shot-detection, strokes gained, AI Caddie club recs; free Coaches Dashboard (USC, Alabama, Oklahoma State, FAMU, Howard). | Data source, **not** a workflow competitor. Auto-ingest from Arccos is table stakes ("manual entry is #1 Clippd complaint"). | Automated shot capture; free coach dashboard = distribution into programs. | ~90% detection accuracy, sensors fall off mid-round, confusing SG redesign; shot-only (no practice/fitness/strategy/goals); "AI" Caddie is a club recommender, not a coach. | Ingest Arccos as a source (with sanity checks) and occupy the space it can't: conversational layer + Goals object. | **Low** |
| **Shot Scope** | Recreational GPS/shot-tracking watches + sensors with post-round stats. | Recreational, hardware-bound — not a college-team product. | Affordable consumer hardware + basic stats. | No college-team workflow, no coach layer, no goals/qualifier tooling. | Non-overlapping buyer; at most another ingest source, never a coach product. | **Low** |
| **TheGrint** | Consumer handicap-tracking + GPS + stats app (USGA-aligned handicap for individuals). | Recreational — handicap/scoring for individuals, not team ops. | Handicap + social scoring for amateurs. | No team management, no SG-depth coaching, no roster/qualifier surface. | Different buyer entirely; not a coaching or team-ops threat. | **Low** |
| **Golf Genius / CoachNow Academy** | Golf Genius = tournament-management infrastructure; paired in-repo with CoachNow Academy (video/comms "Spaces") — per [06 §1.5](../../business/06-competitor-positioning.md). | Adjacent infrastructure (tournaments + video/comms), not analytics/coaching. | Entrenched tournament-ops + broad distribution; existing college video/comms footprint. | Not an analytics or coaching threat — **distribution-channel risk** (could bundle a "good enough" analytics tile). | Compete on depth of coaching/insight; treat as a channel to watch, not a feature-parity target. | **Medium** (distribution-channel risk only) |
| **Whoop (recovery)** | Recovery/HRV/sleep/strain wearable with a team-coach dashboard (Vector Connect); used in college athletics generally, including a Miami football case study. | **Not** a golf competitor — explicitly "STEAL FROM THIS" as a coach-UX bar. | One-glance team-status tiles; weekly Monday summary email; recovery→prescription→outcome (closest existing outcome-causality model). | No golf-domain product at all. | Adopt its UX/cadence patterns for the coach roster dashboard + weekly digest; never treat as golf feature-parity. | **Low** (UX bar, not a competitor) |

**Also-named second-tier (context only, per [06 §1.5](../../business/06-competitor-positioning.md)):** Golfstat (legacy scoring, lost NCAA contract 2023, no SG — already losing); 18Birdies (AI Coach single-video swing feedback — closest free "coach chat" UX college players see); TrackMan Performance Studio ("Tracy" AI = single drill recommender); AimPoint; Hudl. None change the golf roadmap directly.

---

## Group 2 — Baseball recruiting (analyst-estimate; repo does no head-to-head)

> Caveat: [06 §4](../../business/06-competitor-positioning.md) and [07 §5](../../business/07-baseballhelm-context.md) state BaseballHelm has **no** researched competitive set in-repo. The table below is external-market context to seed research, not repo positioning. Threat levels are analyst estimates.

| Competitor | What it is | Overlap with Helm | Key strengths | Weaknesses / gaps | Helm's edge / opportunity | Threat |
|---|---|---|---|---|---|---|
| **NCSA** | Large recruiting-network / matchmaking service connecting HS athletes to college programs. | Direct — recruiting discovery/pipeline. | Scale, brand recognition, broad athlete base. | Pay-to-play reputation; consumer-athlete sold service, not a clean coach-side operating system; not baseball-specialized. | Helm's premium, opt-in, coach-owned recruiting + team OS (recruiting is opt-in; college players can never activate — [07 §3](../../business/07-baseballhelm-context.md)). | **Medium** |
| **FieldLevel** | Coach-to-coach recruiting network (trusted-referral graph between HS/travel and college coaches). | Direct — recruiting relationship graph. | Coach-trust network effect; strong in the coach-referral workflow. | Network/messaging tool, not a full roster/stats/team-ops system; limited player-data depth. | Pair recruiting with roster + stat honesty + team ops in one trustworthy system. | **Medium** |
| **SportsRecruits** | Recruiting-management platform for clubs/HS programs and families. | Direct — recruiting CRM/management. | Organized recruiting workflow for club programs. | Club/family-facing; not a college-coach recruiting + team OS; multi-sport, not baseball-deep. | Single premium OS spanning recruiting + roster + stats for the college buyer. | **Medium** |
| **Perfect Game** | Dominant baseball showcase/event + scouting-data ecosystem; player rankings and event data. | Partial — a scouting-**data** source and the discovery layer college coaches already live in. | Category-defining event/scouting data and rankings; deep baseball penetration. | Event/data ecosystem, not a college-program operating system; not a roster/team-ops product. | Best treated as a data/interop and discovery source; Helm owns the program's internal workflow around that data. | **Medium/High** |
| **Prep Baseball Report (PBR)** | Baseball scouting/media + showcase data network (state-level scouting coverage). | Partial — scouting-data + discovery. | Strong regional scouting content and prospect data. | Media/scouting network, not a team/roster OS. | Ingest/reference scouting data; own the coach's decision + team workflow. | **Medium** |

---

## Group 3 — Baseball team-management + scoring

> GameChanger, StatCrew, PrestoSports, and SIDEARM are named **in-repo only as interop targets** ([06 §4](../../business/06-competitor-positioning.md), [07 §5](../../business/07-baseballhelm-context.md)). Everything else here is analyst-estimate.

| Competitor | What it is | Overlap with Helm | Key strengths | Weaknesses / gaps | Helm's edge / opportunity | Threat |
|---|---|---|---|---|---|---|
| **GameChanger** | Ubiquitous scorekeeping/stats/streaming app for amateur baseball/softball. | **Interop-only (repo)** — named as a stats/scorekeeping import source. Product-wise overlaps scoring/stats. | De-facto amateur scoring standard; huge data footprint; parents/teams already use it. | Amateur-tier scoring app, not a college recruiting + program OS; shallow coach analytics. | Import GameChanger data cleanly (idempotent imports, source/timestamp/confidence — [07 §3](../../business/07-baseballhelm-context.md)); win on the college coach's recruiting + team workflow above it. | **Medium** (interop, not head-to-head per repo) |
| **StatCrew** | Collegiate stats/scoring system. | **Interop-only (repo)** — named as a stats import source. | Entrenched college stats rails. | Legacy stats software, not a coach recruiting/team OS. | Interop target (parse/schema-map/ID-reconcile); compete on the coach workflow, not the stats feed. | **Low/Medium** (interop) |
| **Teamworks** | Athletic-department operations platform (comms, scheduling, compliance) for college programs. | Adjacent — team ops / staff workflow at the department level. | Deep college-athletics footprint; broad ops suite. | Department-wide generalist, not baseball recruiting-specialized; heavy/enterprise. | Baseball-specific, premium, fast; the program-level baseball OS vs a horizontal department tool. | **Medium** |
| **Hudl** | Video + analytics platform across many sports. | Adjacent — video/analytics; also appears in golf second-tier. | Dominant video workflow; broad sport coverage. | Video-centric; not a baseball recruiting/roster OS; distribution-channel risk (could bundle "good enough" tiles). | Own the recruiting + roster + stat-honesty workflow video doesn't cover. | **Medium** |
| **PrestoSports** | Team-site + stats platform for college athletics. | **Interop-only (repo)** — named as a stats/team-site import source. | Entrenched college stats/site rails. | Publishing/stats infrastructure, not a coach recruiting/team OS. | Interop target (parse/schema-map/ID-reconcile); compete on the coach workflow, not the stats site. | **Low/Medium** (interop) |
| **SIDEARM Sports** | College athletics websites; source of NCAA stats-exchange XML. | **Interop-only (repo)** — SIDEARM/NCAA XML is the official stats-exchange format for imports. | Standard college-site + NCAA XML rails. | Web/publishing + data format, not a competing product. | Treat NCAA XML/SIDEARM as a data-format interop concern, never a "does this beat SIDEARM" question ([06 §4](../../business/06-competitor-positioning.md)). | **Low** (interop) |
| **ARMS** | Recruiting-compliance / CRM software for college athletic departments. | Adjacent — recruiting CRM + compliance. | Compliance/CRM depth for departments. | Compliance-centric, not a premium coach-first recruiting + roster experience. | Coach-first, mobile, fast recruiting workflow with built-in recruitability/opt-in gates. | **Medium** |

---

## Group 4 — Baseball performance / hardware (analyst-estimate; data sources)

> These are measurement hardware, not team-OS competitors. For Helm they are potential **data sources**, mirroring how [06 §1.3](../../business/06-competitor-positioning.md) treats Arccos in golf. Threat is low as competitors, higher as must-integrate feeds.

| Competitor | What it is | Overlap with Helm | Key strengths | Weaknesses / gaps | Helm's edge / opportunity | Threat |
|---|---|---|---|---|---|---|
| **Blast Motion** | Bat-sensor swing metrics (bat speed, attack angle, etc.). | Data source — swing-performance metrics. | Trusted bat-sensor data; player adoption. | Sensor + app, no recruiting/roster/team OS; single-modality data. | Ingest as a stat feed; own the coach decision + program workflow. | **Low** (integration target) |
| **Rapsodo** | Portable hitting/pitching ball-flight + biomechanics measurement. | Data source — pitch/hit tracking metrics. | Affordable, widely adopted college/amateur tracking. | Measurement device, not a program OS. | Integrate metrics into honest stat model; differentiate on workflow + recruiting. | **Low** (integration target) |
| **TrackMan** | High-end radar ball-flight tracking (baseball + golf). | Data source — premium tracking; also golf second-tier. | Gold-standard tracking data. | Expensive hardware; not a team/recruiting OS. | Reference/ingest data; compete on coaching + team workflow, not radar. | **Low** (integration target) |
| **Diamond Kinetics** | Bat + ball sensors and player-development app. | Data source — swing/throw metrics + dev app. | Sensor data + development content. | Device/app, not a college program OS. | Ingest metrics; own recruiting + roster + team ops layer. | **Low** (integration target) |

---

## Group 5 — Coaching / AI / wearables + general team ops

> Mixed provenance. Whoop and CoachNow are **repo-grounded** (golf); TeamSnap/SportsEngine/Trace are analyst-estimate.

| Competitor | What it is | Overlap with Helm | Key strengths | Weaknesses / gaps | Helm's edge / opportunity | Threat |
|---|---|---|---|---|---|---|
| **CoachNow** | Coaching communication/video platform ("Spaces"); paired with Golf Genius as CoachNow Academy. | **Repo-grounded (golf)** — video/communication layer; distribution-channel risk. | Strong coach-athlete video + comms UX; existing college distribution. | Comms/video layer, not data-driven analytics or goals/qualifier tooling. | Coach chat that references the player's **actual stats + Goals** is strictly better than a generic thread ([06 §3](../../business/06-competitor-positioning.md)). | **Medium** (distribution risk) |
| **Whoop (team dashboards)** | Recovery wearable + team coach dashboard (Vector Connect). | **Repo-grounded (golf)** — coach-UX bar, "STEAL FROM THIS," not a competitor. | One-glance team tiles; weekly Monday digest; recovery→prescription→outcome. | No sport-specific coaching/recruiting product. | Adopt the cadence/UX; don't chase feature parity. | **Low** (UX bar) |
| **Trace** | Automated game video capture + highlight/analytics service. | Adjacent — auto-video/highlights. | Automated video + clip generation. | Video service, not a recruiting/roster/stat OS. | Own the coach decision + recruiting workflow around highlights. | **Low/Medium** |
| **TeamSnap** | Youth/amateur team management + scheduling + comms. | Adjacent — general team ops (schedule/roster/messaging). | Simple, mass-market team logistics. | Youth/amateur-tier generalist; no college recruiting or deep stat honesty. | Premium, college-baseball-specific OS with recruiting + stat honesty. | **Low/Medium** |
| **SportsEngine (NBC)** | Youth-sports management platform (registration, scheduling, org ops). | Adjacent — org/team management at the youth level. | Scale in youth-sports org management. | Registration/ops platform, not a college recruiting/coaching product. | Different buyer (college program); compete on recruiting + coach workflow depth. | **Low** |

---

## Helm's deliberate differentiators (grounded in [docs/business/06](../../business/06-competitor-positioning.md))

The wedge is the **coaching layer**, not the stat layer. Three surfaces no competitor in the researched golf set has shipped, plus supporting differentiators:

| # | Differentiator | Why it's defensible (per [06 §2](../../business/06-competitor-positioning.md)) |
|---|---|---|
| 1 | **Conversational LLM round review** | Nobody in the set has it — Clippd renders static dashboards, 18Birdies does single-video feedback, TrackMan "Tracy" gives one drill. Unmet demand is documented (players pasting stats into ChatGPT). Must be **causal, not `summarize(stats)`** — a non-causal review is "a parlor trick a static dashboard does better." |
| 2 | **Coach-approved player Goals as a first-class object** | Clippd's "What To Work On" and DECADE Combines are data-derived but **not** player-set/coach-approved/wired into daily surfacing. "Strong moat if actually wired in" — a Goal that only stores/displays is a **vanity feature**. |
| 3 | **Qualifier / travel-selection workspace** | The "most-painful, most-frequent, most-poorly-tooled" college-golf workflow, still run in Google Sheets. A first-class object here must be **more trustworthy than the spreadsheet** it replaces (keep selection history + coach's-pick reasoning). |
| — | **Supporting:** standing bars (PGA + team + you in one render), composite insights across data sources, player genome (vs Clippd's single number), **outcome causality** ("the single biggest unmet need in the entire space"). | Cheap-but-differentiating framing devices + the hardest-to-fake capability (needs shot-level data + season context + LLM + feedback loop together). |

**The me-too trap:** every named competitor weakness ([06 §3](../../business/06-competitor-positioning.md)) is something Helm must not recreate — manual entry when auto-ingest exists, unexplained SG, silent downgrade of a paid AI feature, generic data-less coach chat, goals-blind insight ranking, raw score/FIR/GIR/putts-only regressions, or accepting obviously-wrong sensor data.

**Baseball framing (do not confuse):** BaseballHelm's differentiation is the **same suite promise** — a clean, premium operating system that removes spreadsheet/manual work and keeps data trustworthy ([07 §5](../../business/07-baseballhelm-context.md)) — but the repo has **no** researched baseball competitive set. Every baseball threat level above is an analyst estimate to seed research, not repo positioning.

---

## For Mission Control

This doc is a **derived reference** for the automation layer. It is not a source of truth — [docs/business/06-competitor-positioning.md](../../business/06-competitor-positioning.md) is. If the two ever disagree, 06 wins and this doc should be updated to match.

| Tool | How to use this doc |
|---|---|
| **Huly** | Seed the "Competitive Intel" space with one card per competitor above, keyed by the group headers (Golf / Baseball recruiting / Baseball team-mgmt+scoring / Baseball performance-hardware / Coaching-AI+wearables). Copy the row fields into card properties: `overlap`, `strengths`, `gaps`, `helm_edge`, `threat`, `provenance` (Repo-grounded / Interop-only / Analyst-estimate). Treat **Clippd = High** as the only repo-sanctioned "PRIMARY THREAT"; tag all baseball cards `analyst-estimate` so they aren't mistaken for positioning. |
| **n8n** | Use the provenance tags to gate automations: only **Repo-grounded** golf rows may feed customer-facing positioning/battlecards without human review; **Analyst-estimate** baseball rows require a human/research step before external use. Watch [docs/business/06-competitor-positioning.md](../../business/06-competitor-positioning.md) and [docs/v3-research-competitive-landscape.md](../../v3-research-competitive-landscape.md) for changes and open a Huly task to reconcile this doc when they move. Never emit competitor pricing or counts that aren't cited here, and never emit pricing for Helm's own product (none is set in-repo per [06 §5](../../business/06-competitor-positioning.md)). |
| **Greptile** | When reviewing PRs, use the "Helm's deliberate differentiators" table + [06 §3](../../business/06-competitor-positioning.md) me-too list as the lens: flag any change to `composeRoundReview` / `composeHeroNarrative` / `composeCoachChat` (`src/lib/coachhelm/v3/llm/`), the Goals object, or the qualifier workspace (`golf_qualifiers` / `golf_qualifier_entries` / `golf_qualifier_selections`) that dulls a differentiator or recreates a named competitor weakness. |

> No secrets, tokens, or PII live in this file — it is a competitor map plus pointers to in-repo docs.
