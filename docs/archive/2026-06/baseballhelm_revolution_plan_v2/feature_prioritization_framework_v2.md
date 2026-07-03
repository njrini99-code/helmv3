# Feature Prioritization Framework V2

A feature does not survive because it sounds cool. It survives only if it creates coach value, player value, staff value, demo value, daily usage, retention, or a clear strategic wedge.

| Feature | Classification | Coach value | Player value | Demo value | Phase | Rationale |
|---|---|---:|---:|---:|---|---|
| Coach Command Center | Must build now | 10/10 | 4/10 | 10/10 | Phase 1 | Default staff home; highest demo and daily value. |
| Player Today | Must build now | 8/10 | 10/10 | 8/10 | Phase 1 | Mobile habit loop and adoption anchor. |
| Roster + Player Profiles | Must build now | 9/10 | 8/10 | 9/10 | Phase 1 | Canonical identity layer for every other object. |
| Player Timeline | Must build now | 10/10 | 8/10 | 10/10 | Phase 1/1.5 | Core differentiation; can start with events/notes/imports. |
| Calendar / Team Ops | Must build now | 9/10 | 8/10 | 8/10 | Phase 1 | Schedule, events, acknowledgements, conflicts. |
| Practice Planner Lite | Must build now | 9/10 | 7/10 | 9/10 | Phase 1 | Publishable practice plan with attendance/recap; not full drill universe. |
| Stats Center Lite | Must build now | 9/10 | 7/10 | 8/10 | Phase 1 | Official stats imports and game/season views. |
| Import Center MVP | Must build now | 10/10 | 4/10 | 10/10 | Phase 1 | No-direct-integration strategy lives or dies here. |
| CoachHelm Daily Brief | Must build now | 10/10 | 5/10 | 10/10 | Phase 1 | AI value that is demoable and daily. |
| Performance Lite | Must build now | 8/10 | 8/10 | 8/10 | Phase 1 | Lift assignments/results, wellness, availability; not full strength platform. |
| Reports | Build for demo | 8/10 | 5/10 | 9/10 | Phase 1.5 | Staff meeting/player meeting one-pagers sell well. |
| Staff Decision Room | Build for demo | 10/10 | 4/10 | 10/10 | Phase 1.5 | Sales wow and retention hook. |
| Player Development Brief Mode | Build for demo | 9/10 | 7/10 | 9/10 | Phase 1.5 | Turns timeline into coaching workflow. |
| Hitting Development Depth | Build after first pilot | 8/10 | 7/10 | 7/10 | Phase 2 | Import metrics and notes first; avoid cloning Rapsodo/Blast. |
| Pitching Development Depth | Build after first pilot | 9/10 | 7/10 | 8/10 | Phase 2 | Bullpens/workload/imported pitch metrics; avoid medical claims. |
| Full Lift Builder | Build later | 5/10 | 7/10 | 4/10 | Phase 3+ | Too much TeamBuildr overlap; import/assignment layer first. |
| Academics | Import only | 6/10 | 5/10 | 5/10 | Phase 3 | Class conflicts and study-hall flags only; not compliance/advising engine. |
| Travel Logistics | Build after first pilot | 7/10 | 6/10 | 6/10 | Phase 3 | Itinerary and travel roster; not full travel vendor. |
| Recruiting CRM | Build later | 7/10 | 2/10 | 7/10 | Phase 4/separate | Avoid losing focus; internal board only after ops product works. |
| Direct Vendor Integrations | Do not build | 4/10 | 2/10 | 6/10 | Never early | Import-first is strategic; APIs are expensive and fragmented. |
| Open-ended AI Chatbot | Do not build | 5/10 | 4/10 | 6/10 | Never centerpiece | Embedded grounded outputs beat hallucination theater. |

## Cutline rules

- If a feature needs pristine imported data before it works, it cannot be core Phase 1 unless the import itself is Phase 1.
- If a feature duplicates a mature vendor, BaseballHelm should import/attach first and build native only after pilot proof.
- If a feature adds a top-level tab but not a daily action, it is probably not a top-level feature.
- If AI cannot cite source objects, it should not ship.
- If a player-facing surface is not useful in under 30 seconds on mobile, simplify it.
