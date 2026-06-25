# V2 Feature Detail Matrix

This matrix turns the feature review section into build-grade requirements. It is intentionally more specific than the individual 06 review files.

## Phase 1 Feature Contracts

| Feature | Primary user | Phase 1 job | Build now | Defer/cut | Source objects | Primary UI | AI use | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| Coach Command Center | Head coach, assistants, ops | Show today, risk, readiness, practice plan, recent imports, and staff actions in one desktop landing | Today schedule, availability flags, pending acknowledgements, lift/wellness compliance, recent game/practice notes, import status, AI brief | Fancy analytics, department-level compliance, direct vendor sync | events, tasks, acknowledgements, player status, imports, insights | Desktop dashboard with dense cards and action queue | Daily brief, risk flags, staff prep | Coach can answer "what changed, who needs me, what do we do today" in under 60 seconds |
| Player Today | Player | Give the athlete one mobile-safe daily checklist | schedule, tasks, acknowledgements, availability status, assigned lift, practice group, development note | full analytics, staff notes, private academic details | events, tasks, practice blocks, lift assignments, player-visible timeline events | Mobile-first bottom-nav page | Player-safe summary only | Player sees exactly today actions and no staff-only data |
| Roster | Coach, ops | Maintain canonical player identity and status | roster table, position filters, status, eligibility class, contact, invite state, external IDs | scouting marketplace, public recruiting profile | players, team members, external IDs | Dense table plus card view | Data quality warnings | Coach can resolve duplicate/unknown imported players |
| Player Profile | Coach, player limited | Tell the full player story | bio, availability, stats snapshot, development notes, timeline, meeting mode | medical record, public profile, full video platform | player, stats, practice, lift, wellness, notes, AI insights | Profile shell with tabs/sections | Player decision brief | Staff and player views render different visibility-safe content |
| Player Timeline | Staff, player limited | Chronological proof layer across the system | timeline event creation from imports/practice/games/lifts/notes/AI | speculative predictions | timeline events with source refs | Filterable timeline | Summaries with citations | Every timeline item has source, visibility, and owner |
| Calendar/Team Ops | Coach, ops, player | Coordinate events and acknowledgements | events, game/practice/lift/travel/class-conflict markers, acknowledgement status | full Teamworks replacement | events, acknowledgements, travel, academics | Calendar plus agenda | Conflict brief | Players can acknowledge events; staff can see non-responders |
| Practice Planner Lite | Coaches | Build/publish practical baseball practices fast | practice header, blocks, stations, player groups, staff owner, attendance, recap | giant drill marketplace, auto-generated perfect practice | practice, blocks, attendance, notes, stats flags | Builder plus published view | Practice suggestions from source data | Coach can publish a 90-minute plan and players see only relevant details |
| Stats Center Lite | Coaches | Separate official stats from development metrics | game logs, season summaries, official source label, import history, basic splits | live scoring replacement, deep public website stats | games, official stat lines, imports | Tables with filters and player links | Game recap, data quality flags | Same player/game/source cannot duplicate without warning |
| Hitting Development | Hitting coach | Track key development inputs without cloning vendor dashboards | imported metrics, notes, goals, timeline link, player profile section | swing biomechanics engine | hitting metrics, notes, practice grades | Player profile section and report | Trend summary, practice focus | Metrics are source-labeled and optional |
| Pitching Development | Pitching coach | Track workload and pitch development inputs | imported pitch metrics, bullpen notes, usage markers, player profile section | pitch design lab clone | pitching metrics, games, practice, notes | Pitching tab/profile section | Workload and pitch trend flags | Two-way players and relievers are handled explicitly |
| Performance Lite | Strength coach, coaches, players | Track assigned/completed lift work and readiness | lift assignments/results import, completion, soreness/sleep/energy, availability | full exercise library, periodization builder | lifts, wellness, availability, events | Staff compliance table, player today card | Workload/readiness explanation | Strength staff cannot see restricted academic detail by default |
| Wellness/Availability | Player, staff | Collect transparent non-medical status and limitations | daily check-in, availability status, limitations, staff visibility | medical diagnosis, injury treatment | wellness, availability, notes | Player check-in, staff status board | Risk flag with caveats | AI never makes medical claims |
| Academics/Availability | Ops, academic viewer, coaches limited | Surface conflicts without becoming compliance software | class schedule import, conflict detection, travel letter marker, eligibility risk field if provided | full tutoring/study hall/compliance engine | classes, events, conflicts | Conflict list and calendar badges | Conflict insight | Coaches see conflicts, not private academic notes unless permitted |
| Communication | Coaches, players | Support action acknowledgements and team updates | announcements/tasks/ack tracking using existing components | Slack clone, open chat expansion | announcements, tasks, messages | Existing communication surfaces | Summarize unread/action items | Urgent messages create visible acknowledgements |
| Travel/Logistics | Ops, players | Put trip plan in calendar/player today | itinerary import, travel roster, lodging/transport blocks, acknowledgements | expense platform, bus tracking | travel, events, acknowledgements | Trip page plus agenda cards | Travel brief | Players see itinerary and required actions |
| Import Center MVP | Ops, coaches | Turn messy CSVs into trusted data | upload, mapping, player match, preview, validation, commit, rollback, audit | direct vendor APIs | import runs, rows, mappings, affected objects | Stepper/wizard | Mapping suggestions and anomaly detection | No row commits without preview and audit trail |
| CoachHelm AI | Coaches, staff, player limited | Embedded intelligence layer | daily brief, flags, summaries, recaps, import cleanup, meeting prep | open-ended chatbot as main UI | source refs across system | Cards embedded in workflows | Structured outputs only | Every AI output has source refs, confidence, visibility, action/disposition |
| Settings/Admin | Admin, head coach | Protect roles, teams, imports, demo mode | role/capability management, invite state, visibility settings, demo reset | billing/enterprise admin | users, team members, capabilities, audit log | Admin tables/forms | Data quality flags | Role changes immediately affect nav and data access |

## Ruthless Prioritization

Must build now:

- Command Center
- Player Today
- Roster/Profile/Timeline
- Calendar acknowledgements
- Practice Planner Lite
- Stats Center Lite
- Performance Lite
- Import Center MVP
- Embedded source-cited AI
- Demo seed data

Build for demo, but keep narrow:

- Staff Decision Room
- Player Development Brief Mode
- Import-to-Insight story
- Practice Intelligence Loop

Build after first pilot:

- Recruiting board
- Advanced development templates
- Rich reports
- Strength programming depth
- Opponent scouting

Import or attach only:

- TrackMan/Rapsodo/Yakker/BaseballCloud exports
- TeamBuildr/Bridge/Volt exports
- raw video
- medical documents
- nutrition records

Do not build now:

- compliance engine
- recruiting marketplace
- full training platform
- full video platform
- direct vendor integrations
- generic AI chat-first product

## Feature Edge Cases The Build Agent Must Handle

- duplicate player names
- player without app account
- player transferred/inactive but still in historical data
- two-way player with hitter and pitcher status
- pitcher unavailable for throwing but available for lift
- class conflict overlapping practice
- travel roster excluding non-travel players
- imported stat file with changed jersey number
- same CSV imported twice
- import with partial rows
- coach with team access but no permission for private notes
- strength staff assigned to performance only
- academic viewer with conflict visibility but no performance visibility
- player sees player-visible summaries but not staff notes
- AI card generated from stale data
- AI card dismissed, resolved, or converted into a task
