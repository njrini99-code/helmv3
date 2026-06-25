# V7 Research Findings: Easier Stats Acquisition

The most important conclusion: BaseballHelm should not rely on one generic CSV uploader. College baseball stats move through a small set of repeatable channels, and each one deserves a dedicated parser and storage contract.

## GameChanger

### What The Research Shows

GameChanger has multiple usable extraction paths:

- College baseball/softball staff can export game stats in standard XML accepted by team/league sites such as PrestoSports, SIDEARM, and the NCAA website.
- Staff accounts can export season totals as CSV from app or web.
- Staff can filter stats by groups of games before export, which means BaseballHelm can support game subsets, scrimmage subsets, home/away filters, and date ranges when files are exported.
- GameChanger has staff roles, scorekeeping/videography permissions, stats access, video clips, full game archives, stat editing, spray charts, pitch counts, and 150+ stats according to public app/listing/help materials.
- GameChanger does not appear to offer a public, documented API for general team data access. Treat any unofficial scraping/API workaround as unsafe unless a formal integration is obtained.

### BaseballHelm Product Decision

Build three GameChanger ingestion modes:

1. `gamechanger_college_xml_import`
   - Best path for college teams.
   - Parse one game file.
   - Include both teams, score, box score, play-by-play if present, and source refs.
   - Store as official game or scrimmage depending on game type selected during import.

2. `gamechanger_season_csv_import`
   - Best path for teams without college XML or for quick historical migration.
   - Parse season totals CSV.
   - Store as season snapshot facts, not per-game truth unless game-level identifiers exist.
   - Allow stat filters to be labeled: all games, wins, losses, home, away, scrimmage, custom group.

3. `gamechanger_boxscore_pdf_or_manual_review`
   - Fallback only.
   - Store PDF as source document.
   - Extract text if possible, but require review before commit.
   - Never silently make official stats from low-confidence PDF extraction.

### What Not To Do

- Do not promise GameChanger API sync unless a formal API/partner path exists.
- Do not build fragile scraping as the default.
- Do not mix season CSV totals into per-game stats.
- Do not let follower/player accounts import stats as official without staff review.

## StatCrew

### What The Research Shows

StatCrew baseball/softball supports XML output from game reports and conference/NCAA report workflows.

### BaseballHelm Product Decision

Build `statcrew_xml_import`:

- Parse NCAA-style single-game XML.
- Parse team/player official lines.
- Preserve XML raw file.
- Create diff view on re-import because official scorers update decisions.
- Support packed/report files later only if formats are available.

## PrestoStats / PrestoSports

### What The Research Shows

PrestoStats is a web-based stat platform for game/season statistics. Public materials note automatic updates of season/player/game stats and sharing data with NCAA and other PrestoSports network sites. Presto support also references XML or packed files being attached/uploaded to events, and stats tabs where box score files can be downloaded.

### BaseballHelm Product Decision

Build `presto_xml_or_pak_import`:

- Phase 1: XML first.
- Phase 2: packed file support if format is documented and test files exist.
- Allow staff to link an import to a calendar game event.
- Store event/site metadata separately from baseball stat records.

## SIDEARM / NCAA XML

### What The Research Shows

SIDEARM is widely used across NCAA athletics. NCAA resources still reference single-game XML submission, roster submission, schedule/results updates, and live stats transitions. The key shared currency is XML, not a universal coaching API.

### BaseballHelm Product Decision

Build `ncaa_sidearm_xml_import`:

- Accept XML exported from official stat workflow.
- Treat as official only if team settings designate the source as official.
- Allow SID/staff role to upload but let baseball staff approve how BaseballHelm uses it for player development.

## NCAA LiveStats / Genius

### What The Research Shows

NCAA LiveStats exists across sports and continues to evolve. Recent public reporting around college baseball stats software disruption suggests baseball workflows are still in transition.

### BaseballHelm Product Decision

Design an adapter slot but do not block the product on a direct integration:

- `ncaa_livestats_xml_import`
- `ncaa_livestats_api_future`
- `ncaa_livestats_manual_file_drop`

The architecture should let a future API adapter write into the same import/run/source tables as XML upload.

## 6-4-3 Charts

### What The Research Shows

6-4-3 Charts is a major college baseball/softball analytics platform, trusted by many college programs, integrating Synergy, TrackMan, AWRE, user-logged pitch tracking, play-by-play, custom reports, and drag/drop custom reporting.

### BaseballHelm Product Decision

Do not try to out-6-4-3 6-4-3 in one shot. Integrate around it:

- Import reports/exports.
- Store external report references.
- Link 6-4-3 insights to BaseballHelm practice, tasks, player profiles, meetings, and CoachHelm outcomes.
- Use custom-report import profiles because teams may export different report templates.

## Driveline TRAQ

### What The Research Shows

TRAQ is explicitly positioned as a hub for player development: scheduling workouts, programming athletes, setting goals, uploading videos, uploading hitting/pitching technology data, writing lifts, throwing schedules, swing video review, and reporting from many technology partners.

### BaseballHelm Product Decision

TRAQ is the best benchmark for BaseballHelm's player-development depth. BaseballHelm should win by combining TRAQ-like player-development workflow with college team ops, official stats, class conflicts, strength/lift readiness, and staff meeting execution.

Build:

- `traq_export_import` if CSV/report exports are available.
- Player development session import profiles.
- Video/reference import support.
- Lift/throwing program import support later.

## TrackMan and Rapsodo

### What The Research Shows

TrackMan is used for game and practice tracking with detailed ball/player tracking. Rapsodo is used for player development with hitting/pitching metrics and real-time data/video feedback.

### BaseballHelm Product Decision

Build specific parsers:

- `trackman_pitch_csv_import`
- `trackman_batted_ball_csv_import`
- `rapsodo_pitch_csv_import`
- `rapsodo_hitting_csv_import`

Each should store development metrics separately from official stats and link to games, scrimmages, practices, bullpens, cages, or player profile bests.

## Practical Stats Acquisition Ladder

BaseballHelm should guide the user to the easiest available path:

1. Direct API or partner sync if formally available.
2. Official XML upload.
3. Vendor CSV/XLSX export.
4. Vendor report import.
5. PDF/text extraction with review.
6. Manual entry.

For GameChanger specifically:

- College team: prefer XML.
- Non-college or quick historical import: prefer season CSV.
- Single game without XML: filtered CSV or box score PDF/manual review.

