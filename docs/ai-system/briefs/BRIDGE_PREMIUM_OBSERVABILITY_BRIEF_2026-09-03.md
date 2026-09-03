<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Helm Bridge Premium Observability Architecture (owner brief, 2026-09-03)

Status: design specification, approved by the owner for implementation in auto mode
("all of this on main and green in the morning"). Direction: **Option A** — preserve the
existing Fairway Bridge shell and route structure, replace roughly the top 40–50% of
Overview with a premium visual Command Deck, and make every existing tab a focused
drill-down into the same underlying operating model. Primary goals: understandable
incidents, aggressive deduplication, release-aware error tracking, premium
observability, self-heal visibility, Engineering OS visibility, fast triage — without
turning Bridge into a generic BI wall. Companion documents:
`docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` (what exists),
`docs/ai-system/HANDOFF_BRIDGE_CONTROL_PLANE_2026-09-03.md` (ownership),
`memory/decisions/ADR-2026-09-03-control-plane-owner-decisions.md` (decisions).

## 1. Product thesis

Bridge should feel like one live operating model of Helm, not twenty dashboards sharing a
sidebar. From `/admin` the operator answers in ~5 seconds: Is production healthy? What
changed most recently? Did anything start breaking after that change? Which real user
journeys are affected? Is it one root cause or twenty duplicate symptoms? Is the
self-healing loop already diagnosing or repairing it? Is the evidence complete enough to
trust? Do I need to decide something now?

Preserve: UnifiedIncident as the canonical incident model; existing `/admin/*` routes and
deep links; the Fairway AppShell, rail, mobile bottom navigation, keyboard shortcuts,
breadcrumbs and command menu; Truth Strip, proof debt, source blindness, lifecycle,
self-heal flow, Flight Recorder, feature health, release data and Engineering OS concepts
(extended, not replaced); unknown/unreadable never becomes green; Fairway is the only
design language. This is an information-architecture and visual-hierarchy upgrade, not a
rewrite.

## 2. What changes

Today the operator assembles the story (Sentry issue + Supabase failure + Vercel deploy +
Flight Recorder trace + self-heal state + GitHub PR + production proof = one incident).
Bridge should assemble it before rendering. Target mental model: one operating model with
three questions — What changed? (Release Wake) · What broke? (Incidents) · What is
acting? (Self-Heal Circuit) — over one evidence graph fed by Sentry, Supabase, Vercel,
Flight Recorder, GitHub, jobs, product signals and the OS. The shift is from
source-shaped UI to question-shaped UI.

## 3. Non-negotiable visual language

Premium because calm, precise and spatially coherent. Follow the Fairway rules:
cream/canvas background; warm-black rail and instrument surfaces where appropriate;
Surface, Inset, Elevated, InstrumentPanel, Readout, StatStrip, StatusPill, Segmented,
Sheet and the other Fairway primitives remain the base; no new glassmorphism; no
cyberpunk; no rainbow charts; green only for genuinely verified good outcomes; unknown,
stale and blind visually distinct from healthy; sport accents are wayfinding, not status;
mono type for ids, SHAs, timings, error codes and readouts; system/SF type as the primary
voice; motion subtle and reduced-motion safe. One dominant visual per page. Calm at rest,
expressive under failure (affected paths illuminate, the release marker becomes
prominent, the affected node gains weight, evidence becomes visually connected). Motion
communicates state, never decoration: one slow pulse on a live source beacon; one
traveling dot on the active self-heal stage; a deploy marker animating once; an active
trace stroke drawing once; a new incident gently entering the queue. No continuous
decorative motion.

## 4. Visual vocabulary (reuse everywhere)

Solid node = known component/feature/service/stage · dashed ring = evidence incomplete /
source unreadable · halo = new or materially changed in the current release window · thin
line = known dependency · brightened line = dependency active in the selected
incident/trace · vertical marker = deployment/release · repeated small ticks =
occurrences of one fingerprint · orbit/ring around an incident = number of independent
evidence sources · small pulse = source actively receiving recent data · traveling dot =
work moving through the automated loop · filled segment = completed/proven lifecycle
stage · hollow segment = waiting/unproven · hatched segment = unknown because evidence
could not be read. Color is never the only indicator; every state also has text, icon or
shape.

## 5. Architecture: one intelligence layer, many lenses

Sources (Sentry, Supabase/Postgres, Vercel, GitHub/CI, Flight Recorder, jobs/Inngest/cron,
product activity, Engineering OS/agent runs) → signal normalization → Evidence Graph →
UnifiedIncident, ReleaseContext, Feature Health Model, Journey Health, Self-Heal State,
Database Posture, Decision Items → Bridge read models → Overview Command Deck, the existing
admin tabs, and a shared Evidence Inspector. Sources provide evidence; Bridge owns the
operating interpretation. Sentry, Supabase, Vercel and the self-heal loop do not define
separate incident taxonomies or queues; they attach evidence to the same read model.

## 6. Derived read models (prefer pure server-side derivation; no new tables unless durable history is truly required)

- **BridgeCommandSnapshot**: global posture; current production runtime identity;
  highest-impact incidents; release watch state; self-heal throughput; feature/journey
  degradations; database posture; source coverage; owner decisions.
- **ReleaseContext** (one production epoch): app release SHA; deploy timestamp;
  PRs/commits included; database migration head at/near release; CoachHelm
  model/prompt/config identity when applicable; feature flags/cohort if applicable;
  baseline release; release watch state; new fingerprints; regressed fingerprints;
  latency deltas; query deltas; invariant deltas; journey deltas; post-deploy proof state.
- **IncidentPresentation** (presentation-safe projection of UnifiedIncident): plain-English
  title; technical signature; root-cause confidence; affected feature;
  operation/journey; affected users/teams; occurrence count; first/last seen; release
  relationship; evidence-source count; lifecycle stage; self-heal position; proof
  coverage; symptoms; top evidence links; recommended next action.
- **FeaturePosture**: feature state; SLO/error-budget state; active incidents;
  golden-path health; invariant health; performance delta; utilization delta; source
  coverage; last changed release; blast radius.
- **DatabasePosture**: connection pressure; long-running queries; blocking/locks;
  rollback/error rate; top regressed queries/RPCs; SQLSTATE mix; current
  schema/migration identity; data-integrity violations; telemetry coverage.
- **DecisionItem** (human judgment only): promote/hold a canary; rollback recommendation;
  verifier disagreement; ambiguous product semantics; security/RLS decision; destructive
  schema choice; autonomy scope increase; repair with insufficient evidence.

## 7. Error names that mean nothing (first-class product problem)

Every incident renders three lines: (1) a deterministic, feature-aware **human title**
("Round autosave blocked by database permissions", "CoachHelm recap could not be saved",
"Push notifications rejected stale Apple device tokens", "Inngest production signing key
is missing", "Server could not reach an external dependency", "Round submit timed out
waiting for Supabase", "Auth session refresh failed"); (2) **operation context** ("Golf >
Round Tracking > Autosave", "CoachHelm > Round Recap > Persist response", "Platform >
Background Jobs > Inngest"); (3) the **technical signature** in muted mono ("42501 ·
permission denied for schema helm_private", "TypeError: fetch failed", "APNs:
BadDeviceToken"). Deterministic resolver order: known SQLSTATE/PostgREST/Auth/Storage/
provider code → known operation/RPC/action → known feature → normalized stack/fingerprint
→ fallback generic category. AI may generate a secondary explanation but is never the
canonical fingerprint or sole title source.

## 8. Duplicate errors

Distinguish occurrences, symptoms, episodes and root causes. Canonical model: one ROOT
INCIDENT with occurrences, affected users/teams, evidence-source count, EPISODES (e.g.
"Aug 25 fixed in PR …", "Sep 02 regression after release …"), EVIDENCE (Sentry events,
Supabase SQLSTATE, Flight Recorder failed stage, Vercel release context) and SYMPTOMS
(user-facing messages, retry exhaustion, stale UI). Highest-confidence merge: same Helm
trace id / same Sentry trace id / same Flight Recorder run / same canonical fingerprint /
same RPC + normalized code + feature/operation. Medium: same feature/operation + same
normalized top frames + same error class/code + tight time window + same release cohort.
Never merge solely on similar message strings, same time, both from Supabase, both "fetch
failed", or same user. A root incident owns multiple source fingerprints (aliases: Sentry
fingerprint, admin_events fingerprint, postgres code + RPC, flight-recorder signature). A
resolved root fingerprint that returns after a proven repair becomes a new EPISODE
("REGRESSION — EPISODE 3, first seen 7m after release …") on the same incident.

## 9. Post-deployment error tracking

Every production deploy creates a Release Watch that asks: new fingerprints? regressed
fingerprints? event volume change? affected-user rate change? p95/p99 change? Supabase
query behaviour change? new SQLSTATE? invariant failing? journey conversion drop? source
coverage change? Display the **Runtime Identity Triplet** where applicable: APP SHA · DB
migration head · AI (CoachHelm prompt/model/config version). Release Watch states:
OBSERVING, CLEAN SO FAR, DEGRADED, REGRESSION DETECTED, ROLLBACK RECOMMENDED, PROVEN
HEALTHY, UNKNOWN. Every incident gets a release relationship: NEW AFTER RELEASE, REGRESSED
AFTER RELEASE, EXISTED BEFORE RELEASE, IMPROVED AFTER RELEASE, NO CAUSAL SIGNAL, UNKNOWN.
Proximity is not causation; correlation strengthens with first-seen shortly after deploy,
changed code/feature, changed code in the trace/stack, candidate-cohort-only impact, clean
baseline cohort, replay reproducing on the new SHA but not the old one.

## 10. Overview: Helm Command Deck

Keep the shell; redesign the upper 40–50% of `/admin`. Desktop: header (HELM BRIDGE ·
PROD SHA · Updated Ns ago · search · refresh) → POSTURE sentence ("Production degraded
after 8e4c5b7d — 1 high-impact incident needs watch") → three columns: HELM SYSTEM ORBIT ·
ATTENTION STACK (ranked incidents with user impact) · DECISION INBOX ("No decision now")
→ RELEASE WAKE ribbon → SELF-HEAL CIRCUIT (Collect → Diagnose → Repair → Review → Deploy
→ Proof) → the existing triage/feature/proof panels continue below. Mobile: posture
sentence; current release watch; top attention items; compact system node strip;
vertical self-heal circuit; existing panels. No network diagram on a phone.

## 11. Helm System Orbit

Stable, small: 6–9 major nodes (Users · Next/Vercel · Auth · Supabase · AI · Postgres ·
Jobs · Realtime), optional app lenses replacing Users with Golf/Baseball/Lift. Each node:
state word; recent event/incident count; tiny latency/error readout where meaningful;
source-confidence ring; release-change halo. Selecting an incident lights only the
evidence-implicated path (Golf user → Next action → Supabase RPC → Postgres 42501) and
fades the rest. Idle state almost monochrome.

## 12. Release Wake

A horizontal temporal ribbon around the last deploy with a DEPLOY marker and lanes:
incidents, user impact, database errors, latency, invariants, self-heal actions. Raw events
are bucketed server-side, never spammed. Clicking the deploy marker enters Release Focus.

## 13. Shared Evidence Inspector

Any incident, release, feature, journey, trace, team, user or agent run opens the same
Fairway Sheet from the right, context-sensitive but structurally stable: title + severity
+ impact; operation context; technical signature; tabs Summary / Evidence / Timeline /
Repair; Summary (first seen relative to deploy, current release, causal confidence);
Evidence (per-source ✓ / ? with "unavailable" spelled out); Self-heal position; "Open full
incident →". No full navigation for every drill-down.

## 14. Incidents (`/admin/errors`)

Signature visual: **Incident Gravity Map** — top 8–20 root incidents as circles (size =
impact; vertical = severity/urgency; horizontal = lifecycle state or time; ring segments =
evidence sources; halo = new/regressed after the current release; outline = proof
completeness), the canonical queue below. Queue cards in this order: human title; feature
> operation; user/team impact; occurrences (not duplicate rows); first/last seen; release
relationship; lifecycle/self-heal state; source coverage; technical signature in muted
mono; recommended next action. Incident detail = four zones: A. Story (what happened, who,
when, what changed, where execution failed, known vs suspected); B. Incident Genome
(occurrence timeline grouped by release: fixed / clean / REGRESSION); C. Evidence graph
(Sentry event → trace id → Flight Recorder ↔ Supabase 42501 → server action ↔ RPC →
release); D. Repair/proof spine (Observed → Diagnosed → Reproduced → PR → CI → Deployed →
Traffic → Proven → Closed). Never ten copies of one stack trace unless occurrences are
explicitly requested.

## 15. Health (`/admin/health`)

Signature visual: **Feature Constellation** — stable feature nodes by app domain (GOLF:
Round Tracking, Stats, Qualifiers, CoachHelm · PLATFORM: Auth, Notifications, Jobs,
Billing · BASEBALL: Roster, Practice, Development, Lifting), each with health state,
active root incidents, SLO/burn, journey state, invariant state, telemetry-coverage ring,
release-change marker; click opens the Inspector. Below: the sortable feature-health table
(sorts: user impact, error-budget burn, release risk, unknown evidence, recent regression,
performance degradation).

## 16. Jobs & Integrity (`/admin/jobs`)

Two questions: did background work run? is durable data consistent? **Heartbeat Matrix**:
rows = critical jobs, columns = expected windows, cells completed / failed / missed /
running / unknown. **Invariant Lattice** grouped by feature (Round durability 12/12,
Qualifier ownership 8/8, Stats derivation 6/7 ← breach, Auth tenancy 14/14); a silent
data-integrity violation visually outranks ordinary warnings.

## 17. Reliability (`/admin/reliability`)

What do independent systems agree is wrong? **Evidence Braid**: source lanes (Sentry,
Supabase, Vercel with the deploy marker, Flight Recorder) aligned by time; converging
signals become a correlation cluster; click shows the common incident, time overlap,
shared feature, release context, confidence, disagreements. Reliability is the
agreement/disagreement layer, not another incident list.

## 18. Self-heal (`/admin/self-heal`)

**Self-Heal Circuit**: Collect → Diagnose → Repair → Review → Deploy → Traffic → Close with
one traveling dot on the active stage; under each automated stage: waiting, stalled,
oldest wait, last successful run, capability proof, current active incident. **Agent
Flight Recorder panel** of recent autonomous runs (time, stage, incident, state,
confidence); clicking a run opens charter, context retrieved, hypotheses, tools, files
changed, tests/replays, verifier verdict, production outcome. A separate **decision lane**
for human-required items.

## 19. Flight Recorder (`/admin/traces`)

**Execution Waterfall** with lanes CLIENT · NEXT/SERVER ACTION · SUPABASE API · POSTGRES ·
JOBS/AI; each step: plain-English stage name, duration, status, input/output shape (never
raw sensitive data), release, error code, durable-state verification. **State-diff rail**
for writes: expected vs observed durable state (round row, holes, shots) with the
divergence marked.

## 20–27. App and customer lenses

Qualifiers: Lifecycle Ribbon (Created → Players → Rounds linked → Scores complete → Ranked
→ Finalized) + a Rule Integrity strip (ownership mismatch, missing rounds, cross-team
linkage, stale rankings, score inconsistency, finalize mismatch) linking into evidence.
Teams: **Team EKG Grid** (30-day strip per team: activity, incidents, failed journeys,
utilization, release impact). Users: table-first directory; **User Journey Ribbon** on
detail (Login → Dashboard → Start round → Autosave → Submit → Stats → CoachHelm) with
incidents, sessions, release, flags/cohort, trace/replay availability. Activity: semantic
threads instead of a raw feed ("Nick completed Round #… · 3 autosaves · 1 retry · final
submit successful · trace available") + an Activity Density Ribbon. Utilization: **Feature
Adoption Map** tied to reliability ("Calendar 78% −18% after release … ← inspect"). Golf:
**Journey River** (Login → Dashboard → Start Round → Autosave → Resume → Submit → Stats →
Coach visibility) with attempts, success, p95, incidents, release delta, then Golf
incidents, DB/RPC posture, team impact, CoachHelm health, recent changes. Baseball:
mirror with Baseball's actual golden paths (roster/onboarding, practice planning, player
development, stats/import, communications, Lift Lab). Lift Lab: **Program Execution Flow**
(Program assigned → Session opened → Readiness → Sets logged → Completed → Progress
updated) with completion rate, stuck sessions, readiness failures, PR/max persistence
errors, cross-sport impact, release regression.

## 28. Deploys & Infra (`/admin/deploys`)

**Release Runway** (each release a marker: healthy / regression / observing); click opens a
baseline comparison table (root incidents, affected users, round-submit success, DB p95,
new SQLSTATEs, invariant breaches with deltas); a post-deploy Watch Panel (watch duration,
new/regressed fingerprints, error-free user rate, latency shift, DB regressions,
invariant changes, self-heal incidents triggered, production proof); rollback
intelligence KEEP / WATCH / PAUSE ROLLOUT / ROLLBACK RECOMMENDED / UNKNOWN with evidence.
Never execute a rollback from a visual recommendation.

## 29–32. Auth, Work Log, Billing, Ben + Leah

Auth: Funnel + Failure Rail (Attempt → Credentials accepted → Session created → Profile
resolved → App entered) separating expected (bad password, expired link, rate limit,
lockout) from defects (token refresh, RLS/profile bootstrap, cross-tenant anomaly); stable
Auth codes; no incidents from normal wrong-password traffic. Work Log: **Change-to-Proof
Timeline** (Issue → Agent/Owner work → PR → CI → Merge → Deploy → Production proof) with
feature scope, risk score, tests, replay, verifier outcome, incidents caused/resolved;
agent runs as first-class entries visually distinct from PRs/deploys. Billing: calm and
task-focused; only provider health, failed payment attempts, recent billing incidents,
audit trail. Ben + Leah intake: **Evidence Capture Strip** auto-attaching release, DB
migration head, user/team, recent traces, similar incidents (with %), recent deploys,
browser/device, Replay, likely feature, duplicate-report warning.

## 33–36. Global modes, Decision Inbox, source truth

**Release Focus**: a persistent context chip ("Focused on release 8e4c5b7d · Compare to
previous · Clear") re-scopes every tab (incidents prioritize new/regressed; Health shows
deltas; Reliability aligns to deploy time; Self-heal shows the epoch's incidents; Flight
Recorder defaults to that release; app tabs show journey deltas; Work Log shows included
PRs; Deploys shows baseline comparison); URL state preserves it. **Incident Focus**: a
context pill ("INC-142 · Round autosave permissions · Open · Clear") makes other tabs
lenses over that incident. **Decision Inbox** lives in the Command Deck (optionally a
command-menu saved view), only human-judgment items, calm empty state "No decisions
waiting on you." **Source truth everywhere**: a reusable SourceConfidenceRing ("Evidence
3/4 · Sentry ✓ · Supabase ✓ · Flight Recorder ✓ · Vercel ?"), text always accessible;
never "0 errors" when the Sentry read failed — "Error count unknown — Sentry read failed".

## 37–40. Database posture, Engineering OS, causal confidence, blast radius

Database evidence feeds Bridge (Overview posture line; drill-downs in Reliability, Jobs &
Integrity, Deploys, incident detail, Flight Recorder, app tabs; no new top-level Database
tab initially). Signature DB visual **Query Pulse** (top-query/regression strip; selection
shows calls, mean/p95/max, DB time, release delta, incidents, locks, SQLSTATE mix).
**Engineering OS confidence strip** on repair detail (feature context ✓, blast radius ✓,
regression test ✓, replay ✓, security verifier n/a, product verifier ✓, production proof
waiting). **Causal confidence** as an evidence ladder ("LIKELY CAUSED BY RELEASE … 0.86: +
began 4m after deploy, + affected feature changed, + failing RPC changed, + candidate
cohort affected, + baseline cohort clean, − external provider latency also elevated");
never 100% from temporal correlation alone. **Blast radius**: a bounded one-to-two-hop map
from the selected entity (Round Tracking → Stats, Qualifiers, CoachHelm, Postgame Review;
affected journeys, tables/RPCs, verification suites), never the whole graph.

## 41–43. Performance, mobile, interaction

Server-first; compact visualization models to the client, never raw events; fail-soft
boundaries per Command Deck module; per-source freshness (no fake global timestamp);
refresh cadences (posture 30–60 s, Sentry ~60 s cache, Supabase compact snapshots, Vercel
slower outside Release Watch, GitHub faster only during active repair, history long
cache); payload limits (Orbit ≤ 10 nodes; Gravity Map top 20; Wake bucketed server-side;
traces paginated/virtualized; blast radius subgraph only). Mobile keeps the bottom nav
with purpose-built transformations (Orbit → node matrix/rail; Gravity Map → ranked cards;
Wake → scrollable ribbon; Circuit → vertical rail; Braid → stacked timelines;
Constellation → sortable cards; waterfall → scrollable lanes with sticky labels;
Inspector → full-height Sheet). Command menu searches incidents by human title/code/
fingerprint, users, teams, release SHAs, trace ids, PRs, features, jobs, saved views;
hover previews, click opens; stable deep links or copy-link for every meaningful
selection.

## 44. What NOT to do

No second incident model, source-health model or self-heal lifecycle; no generic Logs or
Database tab; no raw Sentry spam or raw Postgres logs as the main experience; no
per-occurrence cards; no incidents named from technical messages alone; deploy proximity
is not causation; no giant force-directed graph; no particle animation; no other design
system; color never the only signal; unknown never rendered as zero; AI summaries never
overwrite deterministic evidence; Overview is not a BI wall.

## 45. Implementation order

**Phase 0 — Truth and naming (before visuals):** canonical human-readable incident title
resolver; root-cause dedupe / fingerprint alias model; incident episodes / regression
model; release context and runtime identity; consistent release tag on app/server/DB
follow-up evidence; post-deploy comparison read model; evidence-source coverage model.
**Phase 1 — Incidents + release tracking:** incident cards; Incident Genome; release
relationship labels; post-deploy Release Watch; Shared Evidence Inspector. **Phase 2 —
Overview Command Deck:** posture sentence; System Orbit; Attention Stack; Decision Inbox;
Release Wake; Self-Heal Circuit summary (keep the existing lower panels). **Phase 3 — Core
triage tabs:** Feature Constellation; Evidence Braid; full Circuit; Execution Waterfall;
Heartbeat Matrix + Invariant Lattice; Release Runway. **Phase 4 — App and customer
lenses:** Golf Journey River; Baseball journeys; Lift Lab flow; Teams EKG; user journey
ribbon; adoption map; semantic activity threads. **Phase 5 — Engineering OS:** Agent
Flight Recorder; change-to-proof Work Log; charter visibility; verifier evidence; blast
radius; causal confidence; repair-quality views. **Phase 6 — polish:** motion/reduced
motion; mobile; keyboard/search; loading states; accessibility; performance budgets;
screenshots/visual regression.

## 46. Acceptance criteria

Error comprehension (plain-English title on every high-value incident; signatures
secondary; known codes map to categories; a non-engineer understands line one).
Deduplication (one cause = one root incident; cross-source evidence attached;
regressions = episodes; downstream symptoms attached when evidence supports). Release
tracking (every deploy creates a Release Watch; new vs regressed distinguishable;
existed-before visible; baseline comparison; SHA/DB/AI identity; production proof that a
fix stayed fixed). Triage in ~5 s from Overview (posture, release state, highest-impact
issue, self-heal acting?, evidence blind?, decision waiting?). Observability per incident
(Sentry, Supabase, Flight Recorder, release, PR/CI/repair, self-heal, feature/journey,
user/team impact, source confidence, proof). Visual quality (Fairway only; one dominant
visual per page; calm healthy state; explanatory failure state; reduced motion; mobile
transformations; unknown never equals healthy). Performance (no raw provider payloads to
the client; compact read models; one provider failure cannot blank the page; large data
paginated/virtualized).

## 47–48. The final experience and architecture statement

Nick opens Bridge: "Production degraded after 8e4c5b7d. One high-impact Golf incident
affects 72 users. Repair is already running." The Orbit lights Golf → Next → Supabase →
Postgres with Postgres failing; the Release Wake shows the incident four minutes after
deploy; the card is titled "Round autosave blocked by database permissions" with 72 users
· 8 teams · 1,284 occurrences · NEW AFTER RELEASE · Sentry ✓ Supabase ✓ Flight Recorder ✓
Vercel ✓ · Repair running; the Inspector says changed code overlaps the failing RPC, the
Flight Recorder reaches Postgres and fails at persistence, Sentry and Supabase agree on
42501, the baseline release was clean, causal confidence 0.91; the Circuit shows Repair
active; a PR appears; CI and replay pass; Deploys enters Release Watch; the Wake shows no
recurrence; the lifecycle closes only with sufficient proof; Bridge reads "Production
healthy. Previous incident fixed and proven under 6h of production traffic. No decisions
waiting on you." Bridge is the visual control plane for Helm's operating truth: ONE
INCIDENT MODEL · ONE RELEASE MODEL · ONE FEATURE/JOURNEY MODEL · ONE EVIDENCE GRAPH · ONE
SELF-HEAL LIFECYCLE · ONE DECISION SURFACE, rendered through premium Fairway lenses, in
the hierarchy: what needs attention → what changed → root cause → who is affected → what
evidence proves it → what the loop is doing → do I need to decide anything.
