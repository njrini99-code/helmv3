# Market Backed Build Import Ignore Matrix

This is the ruthless feature decision matrix for a market-aware BaseballHelm.

| Market category | Market leaders | Build native | Import/attach | Ignore/defer | Why |
|---|---|---|---|---|---|
| Athletics operations | Teamworks Hub | Player Today, Command Center, acknowledgements, baseball calendar overlays, signal inbox | existing calendars, travel sheets, class conflicts | department-wide workflow engine, enterprise messaging clone | Teamworks owns broad ops; BaseballHelm wins with baseball-specific decisions |
| Compliance/recruiting workflows | Teamworks Compliance + Recruiting/ARMS | lightweight approval/task/audit pattern | eligibility/conflict fields if provided | NCAA rules engine, compliance reporting | too risky and broad for Phase 1 |
| Athlete management/readiness | Smartabase/Teamworks AMS, CoachMePlus | availability summary, limitation-aware practice impact, readiness signals with caveats | wellness surveys, lift data, testing results | medical management, injury prediction, EMR | build operational layer, not medical product |
| Sports EMR | Teamworks Sports EMR | attach/link restricted docs later | availability status from medical staff if explicitly provided | encounters, diagnosis, treatment notes | privacy and liability risk |
| Nutrition | Teamworks Nutrition/Notemeal | none Phase 1 | nutrition notes or fueling reminders later | meal planning, dietitian workflows, kitchen ops | category is too deep and non-baseball-specific |
| Baseball player development | TRAQ | player timeline, goals-lite, development notes, practice-to-development loop | tech metrics, reports, video links | full training program builder, remote coaching suite | TRAQ owns deep development management |
| Device data | TrackMan, Rapsodo, Yakker, Blast | source badges, metric summaries, review status | CSV/XML/export files, links | direct device integrations, proprietary metric modeling | pilots should prove file formats first |
| Advanced baseball analytics | 6-4-3 Charts, Synergy, BaseballCloud | analytics-to-action, staff meeting topics, practice suggestions | reports, CSV exports, PDF links | deep charting platform, national rankings | 6-4-3 owns deep reports |
| Official stats | PrestoStats, GameChanger, SIDEARM, NCAA | stats import status, source-labeled game logs, postgame review | XML/CSV/packed files | live scoring, official web publishing | consume official data, do not replace scorer |
| Strength programming | TeamBuildr, BridgeAthletic, TrainHeroic | lift compliance, readiness link, strength staff view | lift assignment/results exports | exercise library, periodization builder | strength platforms are full products |
| Recruiting networks | FieldLevel, SportsRecruits, PG, PBR | roster construction board later | prospect list/scouting metrics later | marketplace, public profiles, coach network | network effects are hard and off-wedge |
| Communications | Teamworks, GroupMe, Slack | task/acknowledgement and urgent notices | message history maybe later | full chat clone | communication matters only when connected to baseball action |

## Build Now Enhancements

These should be in the one-shot target:

- Signal Inbox
- source trust badges
- Player Timeline 2.0
- Import Dossier
- Postgame Action Review
- Practice Intelligence Board
- Availability/Readiness Hub
- Staff Decision Room
- Player Today 2.0

## Build Later Enhancements

- Roster Construction Board
- Prospect import board
- advanced development goal templates
- opponent scouting
- drill library
- direct vendor integrations
- nutrition reminders

## Product Kill List

Do not let the build drift into:

- generic CRM
- recruiting social network
- NCAA compliance engine
- EMR
- strength programming clone
- video analysis platform
- deep analytics/reporting clone
- chatbot center with no workflow
