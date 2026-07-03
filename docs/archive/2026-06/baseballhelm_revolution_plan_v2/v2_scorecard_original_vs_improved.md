# Original Plan vs V2 Scorecard

| Category | Original score | V2 score | Why original scored that way | What V2 improved | Remaining risk |
|---|---:|---:|---|---|---|
| Market research depth | 7/10 | 9/10 | Broad but too lightly tied to product cuts. | Connected every research category to build/import/ignore and wedge strategy. | Market pages of private vendors may remain incomplete. |
| Baseball specificity | 7/10 | 9/10 | Named baseball areas but some generic SaaS patterns remained. | Converted features into player timeline, practice intelligence, stats-to-practice, two-way-player, bullpen/cage workflows. | Needs real coach pilot feedback. |
| College operations realism | 6/10 | 9/10 | Underweighted ops, academic conflict, travel weekend, staff rhythms. | Added seasonal and staff-role workflows with triggers/data/actions. | School-by-school variation. |
| Coach workflow clarity | 6/10 | 9/10 | Many tabs; not enough daily decision loop. | Coach Command Center + Staff Decision Room + embedded action cards. | Head coach vs assistant preferences differ. |
| Player workflow clarity | 6/10 | 9/10 | Too many player tabs. | Mobile Player Today with schedule, tasks, check-in, focus, personal timeline. | Adoption depends on low-friction check-ins. |
| Product differentiation | 7/10 | 9/10 | Strong concept but could become Teamworks-plus-stats. | Defined Program Command Graph, Player Timeline, Import-to-Insight, Practice Intelligence. | Competitors may move fast with AI. |
| Tab architecture | 5/10 | 9/10 | Too many top-level tabs. | Collapsed into Command, Roster, Calendar/Team Ops, Practice, Stats, Performance, Reports, Import, Admin; AI embedded. | Legacy nav cleanup required. |
| UI/UX clarity | 6/10 | 9/10 | Premium language without enough screen-level specifics. | Added role-based desktop/mobile hierarchies, empty/loading/error states, demo mode UI. | Visual execution still matters. |
| Database readiness | 6/10 | 9/10 | Good table list, insufficient constraints/RLS and migration awareness. | Added canonical identity, import history/rollback, AI source refs, timeline, audit log model. | Must verify current Supabase schema before migrations. |
| Import readiness | 6/10 | 9/10 | Correct flow, not enough row-level mechanics. | Added mapper, matching, duplicate resolution, validation severity, preview, rollback, audit, AI cleanup. | Vendor exports vary wildly. |
| AI practicality | 6/10 | 9/10 | Good guardrails but too feature-silo friendly. | AI becomes briefs/flags/summaries/recommendations embedded in workflows. | Requires clean source refs. |
| AI safety | 7/10 | 9/10 | Recognized no diagnosis/private notes. | Added confidence, citations, disposition state, permission boundaries, staff-review language. | Sensitive academic/wellness boundaries need testing. |
| Implementation readiness | 6/10 | 9/10 | Step order existed but still broad. | Added exact execution order, likely files, tables, UI states, edge cases, tests, acceptance criteria. | Agent must inspect live repo again. |
| Phase plan realism | 6/10 | 9/10 | Too much Phase 1 temptation. | Phase 1 true MVP + 1.5 demo wow + deferred recruiting/advanced AI. | Founder pressure to overbuild. |
| Sales demo strength | 6/10 | 9/10 | Vision was strong but not storyboarded. | Added demo team, storyboard, objection handling, wow checklist. | Needs screenshots after build. |
| Daily usage potential | 6/10 | 9/10 | A lot of features, but weak habit loops. | Daily brief, Player Today, acknowledgements, practice publish, import-to-insight loops. | Player check-in fatigue. |
| Player adoption potential | 5/10 | 8/10 | Player nav too heavy. | Simplified mobile habit and clear value back to player. | Players will ignore if staff does not enforce. |
| Coach retention potential | 7/10 | 9/10 | Large value if executed, but scattered. | Retention via staff meeting mode, player timeline, import history, season/career reporting. | Requires data quality. |
| Technical feasibility | 7/10 | 8/10 | Mostly feasible but too broad. | Smaller MVP and migration-aware build plan. | Existing code debt and RLS complexity. |
| Overall build-agent readiness | 6/10 | 9/10 | Too many generic instructions. | Concrete task sequencing and DoD. | Still needs live schema verification. |

## Bottom line

Original V1: **6.3/10 build-agent readiness** — valuable rough draft, not one-shot safe.

V2: **9.0/10 build-agent readiness** — buildable if the next agent first verifies live schema and route state before migrations.
