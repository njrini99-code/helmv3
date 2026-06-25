# Source Log 2026 Market Pass

This source log records the current market signals used to enhance BaseballHelm's feature plan.

## Athletics Operating Systems

| Source | URL | Market signal | BaseballHelm implication |
|---|---|---|---|
| Teamworks Hub | https://teamworks.com/hub/ | Hub emphasizes communication, scheduling, collaboration, and operations for elite sports organizations. | BaseballHelm must not be a generic calendar/messaging clone. It should make baseball-specific operational decisions faster. |
| Teamworks operating system | https://teamworks.com/ | Teamworks positions around connecting teams, communication, scheduling, file sharing, automated workflows, AI insights, and logistics. | BaseballHelm can borrow the OS framing but must stay narrower, baseball-specific, and easier to adopt. |
| Teamworks Hub collegiate backbone article | https://teamworks.com/blog/teamworks-hub-the-backbone-of-collegiate-athletics/ | Hub's daily athlete app pull comes from calendar, task list, messages, travel, and profiles. | Player Today must be a daily utility, not a player analytics portal. |
| Teamworks Compliance | https://teamworks.com/compliance/ | Compliance + Recruiting uses configurable workflows/rules to automate compliance and recruiting activity tracking. | BaseballHelm should not build a compliance engine. It should build lightweight workflow approvals and exportable audit trails. |
| Teamworks AMS | https://teamworks.com/ams/ | AMS centralizes load, testing, nutrition, survey, medical, readiness, and availability data. | BaseballHelm should build a transparent readiness/availability summary, not medical/injury management. |
| Teamworks Sports EMR | https://teamworks.com/sports-emr/ | EMR owns injury notes, encounters, forms, documents, and availability source of truth. | BaseballHelm should attach/link medical docs at most and avoid medical record features. |
| Teamworks Nutrition | https://teamworks.com/nutrition/ | Nutrition owns personalized meal planning, dietitian workflows, kitchens, and athlete apps. | BaseballHelm should not build nutrition; at most import/attach nutrition availability notes later. |

## Baseball Development And Data

| Source | URL | Market signal | BaseballHelm implication |
|---|---|---|---|
| Driveline TRAQ | https://www.drivelinebaseball.com/coaches/traq/ | TRAQ schedules workouts, programs athletes, sets goals, reviews video, and incorporates hitting/pitching tech data. | Do not clone TRAQ. Build player timeline, goal/status summaries, import lanes, and practice-to-development loops. |
| Driveline Help: What is TRAQ | https://help.drivelinebaseball.com/portal/en/kb/articles/what-is-traq | TRAQ is a hub for workouts, goals, videos, and data from hitting/pitching technology. | BaseballHelm's development module should be lighter and more operational: what changed and what staff should do. |
| Rapsodo Diamond App | https://apps.apple.com/us/app/rapsodo-diamond/id1492851539 | Rapsodo combines hitting/pitching access, cloud data, and team management. | BaseballHelm should consume exports or manual summaries, not duplicate device dashboards. |
| Rapsodo FAQ | https://rapsodo.com/pages/baseball-frequently-asked-questions-faq | Team Management page exposes player sessions separated by hitting and pitching; cloud sync matters. | Import Center should expect sessions by player/date/source and preserve hitting vs pitching type. |
| TrackMan Baseball | https://www.trackman.com/baseball | TrackMan owns high-accuracy player development and in-game tracking. | BaseballHelm should treat TrackMan data as high-trust source input for reports and practice focus. |
| TrackMan V3 metrics | https://www.trackman.com/baseball/V3-Game-Tracking/what-we-track | TrackMan tracks launch metrics, spin, launch angle, exit speed, and distance. | Metrics must be optional source-labeled development data, not mandatory Phase 1 schema bloat. |
| 6-4-3 Charts | https://643charts.com/ | 6-4-3 integrates Synergy, TrackMan, AWRE, play-by-play, and reports; trusted by hundreds of college programs. | BaseballHelm should not compete as deep analytics. It should build the operational layer around imported reports and staff action. |
| ABCA 6-4-3 partner article | https://www.abca.org/ABCA/ABCA/News/2026/ABCA_Adds_6-4-3_Charts_as_Official_Partner.aspx | 6-4-3 integrates Synergy, TrackMan, AWRE, user logged pitch tracking, and play-by-play. | Build import/attachment and "what do we do with this?" workflows, not a charts clone. |

## Strength, Readiness, And Athlete Management

| Source | URL | Market signal | BaseballHelm implication |
|---|---|---|---|
| TeamBuildr | https://www.teambuildr.com/ | Strength programming, athlete logging, mobile/tablet view, and reports. | BaseballHelm should import completion/results and connect them to baseball availability, not build full programming. |
| TeamBuildr reporting | https://www.teambuildr.com/reporting | Completion reports and questionnaire reports show compliance and threshold warnings. | Performance Lite should include completion, questionnaire flags, and baseball action links. |
| TeamBuildr college use case | https://www.teambuildr.com/use-case-college | Strength core plus AMS add-on for wellness, readiness, soreness, pain, and load monitoring. | BaseballHelm should create a baseball-readable readiness board and keep medical-risk language out. |
| BridgeAthletic | https://www.bridgeathletic.com/ | Program builder, exercise library, tracking, data-driven teams, and no-spreadsheet pitch. | BaseballHelm should not clone builder/library; it should improve cross-staff visibility and import from sheets. |
| TrainHeroic | https://www.trainheroic.com/ | Training app turns programming into coaching with tools, tracking, communication, and command center. | BaseballHelm's player side should be action-first, not analytics-heavy. |
| CoachMePlus | https://coachmeplus.com/ | Centralized athlete performance data and customizable AMS. | BaseballHelm should be intentionally less customizable but more baseball-specific. |

## Stats, Scoring, And Official Data

| Source | URL | Market signal | BaseballHelm implication |
|---|---|---|---|
| GameChanger college XML export | https://help.gc.com/hc/en-us/articles/24581262301453-XML-Export-College-Teams-Only | College baseball/softball teams can export XML accepted by PrestoSports, SIDEARM, and NCAA sites. | Import Center must support official-stat source labels and XML/CSV-friendly workflows. |
| PrestoStats | https://www.prestosports.com/prestostats/ | Presto automates record books and web stat updates as stats are entered. | BaseballHelm should not be official web stats; it should consume stats and create coach actions. |
| Presto support stats tab | https://help.prestosports.com/PrestoWeb/v1/stats-tab | Uploaded XML/packed files drive stats and game logs. | BaseballHelm should track missing stats, file provenance, and stat source completeness. |
| Presto baseball best practices | https://www.prestosports.com/baseball-softball-stats-best-practices/ | Official stats workflows include roster setup, game setup, play editing, and postgame wrap-up. | BaseballHelm can add a postgame operational checklist and import-status QA. |

## Recruiting And Roster Market

| Source | URL | Market signal | BaseballHelm implication |
|---|---|---|---|
| FieldLevel | https://www.fieldlevel.com/ | Recruiting network for coaches, athletes, and teams. | Do not build recruiting network. Build roster construction and transfer/import board later. |
| FieldLevel support | https://support.fieldlevel.com/en/articles/811842-what-is-fieldlevel-and-how-does-it-work | Coaches connect, discover athletes, post recruiting needs, and share opportunities. | Recruiting should be Phase 3/4 and focused on internal roster needs, not network effects. |
| Perfect Game | https://www.perfectgame.org/ | Largest amateur scouting database, rankings, reports. | Attach/import scouting references; do not build PG competitor. |
| Perfect Game showcases | https://www.perfectgame.org/Showcases/ | Showcase data includes velo, spin, video, pitch grades, 60 times, and reports. | Prospect import templates should handle scouting metrics later. |
