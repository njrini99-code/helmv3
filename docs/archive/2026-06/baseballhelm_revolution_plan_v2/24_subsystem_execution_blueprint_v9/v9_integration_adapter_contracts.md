# V9 Integration Adapter Contracts

Generated: 2026-06-23

This document fully organizes every planned integration and source pathway for Claude Ultracode. The product strategy is import-first and source-aware. Direct vendor integrations should be added only when credentials, terms, and customer access exist. Until then, every source should have a clear upload, link, email, SFTP, local-agent, CSV/XLSX/XML/PDF/manual, or metadata pathway.

## Universal Integration Rules

Every integration must implement the same operational contract, even when the actual ingestion method differs.

### Required Adapter Behaviors

- detect source
- parse file or submitted metadata
- normalize rows into canonical BaseballHelm objects
- validate required fields
- match players
- match events/games/practices/lifts where possible
- preview commit
- show warnings
- commit with source confidence
- store raw file or raw reference
- support rollback where data was written
- write audit log
- create timeline events where player-affecting
- create signals where useful
- expose source drawer

### Required Source Fields

Every source record should store:

- provider name
- provider category
- program/team
- source trust level
- import method
- raw file or URL
- file hash where file exists
- received at
- imported by or connected account
- reviewed by where applicable
- confidence
- visibility scope
- affected objects
- parser version
- rollback status

### Source Trust Levels

- official
- official_reviewed
- vendor_development
- vendor_video
- coach_entered
- player_submitted
- manual_review
- extracted_low_confidence
- unknown

## AutoSync Channels

### SFTP / FTP Official File Drop

Purpose:

- Receive official XML/CSV/ZIP files after games without coach action.

Ingest:

- Team-specific credentials.
- Provider-specific landing folder.
- File watcher queues parse job.
- Store raw file before parse.

Storage:

- `baseball_autosync_endpoints`
- `baseball_autosync_events`
- `baseball_import_files`
- `baseball_import_runs`

CoachHelm:

- Expected-game-missing alert.
- Postgame report after successful commit.
- Correction diff summary.

Acceptance:

- File can be received, hashed, parsed, matched, committed or held for review.
- Same file hash is ignored as duplicate.
- Same game with different hash becomes correction workflow.

### HTTPS Upload Endpoint

Purpose:

- Give SIDs/admins a secure browser-based destination for official files.

Ingest:

- Authenticated upload link or staff/admin upload.
- Optional tokenized endpoint per team.

Storage:

- Same as SFTP/FTP.

Acceptance:

- Upload creates source, raw file, import run, review or commit result.
- Endpoint cannot expose another team's files.

### Postgame Email Inbox

Purpose:

- Support programs where SFTP setup is too heavy.

Ingest:

- Team sync inbox.
- Email attachment extraction.
- Attachment file hashing.
- Sender/domain optional trust scoring.

Storage:

- raw email metadata
- raw attachments
- import run

CoachHelm:

- "Final file received" signal.
- "Attachment could not be parsed" signal.

Acceptance:

- Email with XML/CSV/PDF attachment creates import run.
- Unsupported attachment creates review item, not silent failure.

### Local Sync Agent

Purpose:

- Support legacy StatCrew/local stat computer workflows.

Ingest:

- Staff logs in once.
- Select watched folder.
- Agent uploads new XML/ZIP/CSV files.

Storage:

- endpoint record
- agent heartbeat
- raw file
- import run

Acceptance:

- Agent status appears in AutoSync settings.
- Missing heartbeat creates warning.

## Official Stats Integrations

### GameChanger College XML

Purpose:

- Official college game file import where program has XML export.

Ingest modes:

- XML upload
- postgame email
- HTTPS upload
- SFTP/FTP where configured
- manual emergency upload

Canonical grain:

- game
- team totals
- player box score
- play-by-play if present
- plate appearance if present

Fields:

- game date
- opponent
- home/away
- final score
- lineup
- batting lines
- pitching lines
- fielding lines where present
- play-by-play where present

Storage:

- `baseball_games`
- `baseball_box_score_batting`
- `baseball_box_score_pitching`
- `baseball_box_score_fielding`
- `baseball_plate_appearances`
- `baseball_import_runs`
- `baseball_import_rows`

CoachHelm:

- postgame action review
- player trend alerts
- two-strike approach signals if play-by-play supports count context
- game-to-practice recommendations

Acceptance:

- XML creates or updates a game.
- Player matching supports external ID, roster name, legal name, jersey, and review queue.
- Import produces official scope, not development scope.

### GameChanger Season CSV

Purpose:

- Historical season snapshot or program backfill.

Ingest modes:

- CSV upload
- Google Sheets export

Canonical grain:

- season player total

Storage:

- season snapshot tables or import rows
- player profile snapshot if configured
- import history

Rules:

- Do not invent game logs from season totals.
- Mark as historical snapshot.
- Confidence lower than game-level official file unless reviewed.

CoachHelm:

- baseline trend context.
- onboarding/demo player profile fill.

Acceptance:

- Season CSV updates player summaries without creating fake games.

### StatCrew XML

Purpose:

- Official college baseball game/season file import and legacy backfill.

Ingest modes:

- XML upload
- ZIP upload
- SFTP/FTP
- local sync agent
- postgame email

Canonical grain:

- official game
- season file
- roster file where available
- play-by-play where available

Storage:

- official game and stat tables
- import files
- correction history

CoachHelm:

- postgame report
- correction diff
- official stat movement signals

Acceptance:

- Re-import can detect corrections.
- Game identity matching prevents duplicate games.

### PrestoSports XML

Purpose:

- Official stats workflow for schools using Presto-style XML processes.

Ingest modes:

- XML upload
- ZIP upload
- SFTP/FTP
- email attachment

Canonical grain:

- official game
- roster
- season
- box score

Storage:

- same official game tables

CoachHelm:

- postgame review
- expected-file monitoring

Acceptance:

- Presto-like game file writes official game rows and links raw source.

### SIDEARM / NCAA XML

Purpose:

- Accept official files used by school website/NCAA workflows.

Ingest modes:

- XML upload
- duplicate game-file destination
- SFTP/FTP where approved
- postgame email

Canonical grain:

- official game
- official season
- roster where present

Rules:

- Do not promise direct API sync without credentials.
- Treat file-driven workflow as the MVP.

Acceptance:

- Official file can land, parse, validate, and commit or hold review.

### StatBroadcast

Purpose:

- Support live/official file workflows where a program can provide accessible files or exports.

Ingest modes:

- uploaded official file
- exported XML/CSV
- link/reference where approved

Rules:

- No scraping.
- No unauthorized live-data claims.

CoachHelm:

- postgame report if final official file exists.
- live trend later only if approved feed exists.

## Tracking Tech Integrations

### TrackMan

Purpose:

- Pitch-level, batted-ball, and media-reference development data.

Ingest modes:

- CSV upload
- XLSX upload
- API later if credentials exist
- media reference import where available

Canonical grain:

- pitch event
- batted-ball event
- bullpen session
- practice session
- game-linked pitch where game context exists

Fields:

- player identities
- pitcher/batter handedness
- pitch type
- pitch velocity
- spin rate
- induced vertical break
- horizontal break
- release height
- release side
- extension
- plate location
- zone
- exit velocity
- launch angle
- spray angle
- distance
- result
- timestamp
- media reference

Storage:

- `baseball_pitch_events`
- `baseball_batted_ball_events`
- `baseball_development_sessions`
- `baseball_video_events` for media refs

CoachHelm:

- pitch shape change
- command decay
- pitch mix shift
- fatigue after threshold
- hitter damage map
- contact quality trend
- bullpen-to-game transfer

Acceptance:

- TrackMan rows can link to game, scrimmage, practice, bullpen, or player session.
- TrackMan cannot overwrite official score unless explicitly mapped to official workflow.

### Rapsodo

Purpose:

- Pitching, hitting, live-on-live, and video-supported player development.

Ingest modes:

- CSV upload
- report upload
- PDF review
- manual-reviewed session import
- API later if program has access
- video link/reference where available

Canonical grain:

- bullpen pitch
- hitting rep
- live AB rep
- batted-ball event
- pitching development session
- hitting development session

Fields:

- pitch velocity
- spin
- movement
- seam orientation if available
- strike zone result
- command target
- exit velocity
- launch angle
- spray
- distance
- session type
- player
- timestamp
- video reference

Storage:

- pitch events
- batted-ball events
- development facts
- video events

CoachHelm:

- pitch design signal
- command trend
- hitting contact quality signal
- live-on-live transfer signal
- game result vs practice quality comparison

Acceptance:

- Rapsodo data becomes development source, not official stat source.
- Player profile shows verified bests sourced from rows, not hand-entered only.

### Yakkertech

Purpose:

- Generic baseball tracking-tech data where program exports files.

Ingest modes:

- CSV/XLSX upload
- saved mapping profile

Storage:

- pitch events
- batted-ball events
- development sessions

CoachHelm:

- same tracking-tech signal family as TrackMan/Rapsodo with lower provider-specific assumptions.

### HitTrax

Purpose:

- Hitting environment and batted-ball data.

Ingest modes:

- CSV/XLSX upload
- PDF/report review

Storage:

- batted-ball events
- development session
- player verified bests where reviewed

CoachHelm:

- contact quality trend
- cage-to-game gap
- power development signal

### Pocket Radar

Purpose:

- Velocity capture for pitching, throwing, exit velocity where used.

Ingest modes:

- generic CSV
- manual entry
- session upload

Storage:

- development facts
- pitch velocity
- throw velocity
- exit velocity

CoachHelm:

- velocity trend signal
- workload/readiness comparison

## Swing Sensor Integrations

### Blast Motion

Purpose:

- Swing quality, timing, connection, plane, and bat speed.

Ingest modes:

- CSV/XLSX upload
- generic swing sensor mapping

Canonical grain:

- swing event
- hitting session

Fields:

- bat speed
- attack angle
- vertical bat angle
- on-plane efficiency
- time to contact
- rotational acceleration
- connection score
- early connection
- connection at impact
- hand speed
- swing quality
- handedness
- drill context

Storage:

- `baseball_swing_events`
- development sessions
- player profile verified metrics

CoachHelm:

- cage swing vs game result gap
- bat speed fatigue trend
- attack angle consistency signal
- timing readiness signal

### Diamond Kinetics

Purpose:

- Swing sensor metrics and showcase/player profile measurables.

Ingest modes:

- CSV/XLSX upload
- generic swing sensor mapping

Fields:

- max barrel speed
- max acceleration
- impact momentum
- attack angle
- contact point
- swing path metrics

Storage:

- swing events
- verified measurables
- showcase player profile where enabled

CoachHelm:

- player development brief
- showcase measurable update
- swing consistency trend

## Video and Scouting Integrations

### Synergy Baseball

Purpose:

- External video evidence, clip links, playlists, reports, scouting context.

Ingest modes:

- clip URL
- report upload
- CSV/PDF review
- manual clip entry
- future API if approved

Canonical grain:

- video event
- game clip
- player clip
- plate appearance clip
- pitch clip
- scouting tag

Storage:

- `baseball_video_events`
- `baseball_video_sources`
- `baseball_video_annotations`
- `baseball_ai_insight_sources`

Rules:

- Do not copy protected video unless permitted.
- Store references and metadata first.

CoachHelm:

- cite video evidence
- create video review tasks
- connect scouting tag to practice plan

Acceptance:

- Staff can attach Synergy clip to player, game, pitch, or task.

### 6-4-3 Charts

Purpose:

- Baseball analytics, Synergy connection, TrackMan sync, AWRE, play-by-play, scouting reports.

Ingest modes:

- CSV/report upload
- PDF review
- video/source link
- manual-reviewed tag import

Canonical grain:

- scouting report
- video reference
- pitch/play tag
- analytic report

Storage:

- development facts
- video events
- scouting notes
- source-linked reports

CoachHelm:

- scouting-to-practice recommendation
- video evidence citation
- opponent/game prep signal
- player trend evidence

Rules:

- BaseballHelm should integrate/import and operationalize outputs, not claim to replace 6-4-3 immediately.

### AWRE

Purpose:

- External video and player-development evidence, often tied to baseball data workflows.

Ingest modes:

- video index
- link
- report upload
- manual reviewed clips

Storage:

- video events
- annotations
- player timeline

CoachHelm:

- video task generation
- mechanical review evidence

### OnForm

Purpose:

- Coach/player video analysis, annotations, shared clips, and player feedback.

Ingest modes:

- shared URL
- uploaded video
- exported notes
- manual annotation entry

Storage:

- video events
- annotations
- tasks
- player timeline

CoachHelm:

- convert annotation into task
- compare video task completion with later practice/game metrics

### Native BaseballHelm Video Upload

Purpose:

- Host videos BaseballHelm controls.

Ingest modes:

- staff upload
- player upload where enabled
- practice/bullpen/cage/lift upload

Storage:

- object storage bucket
- video event metadata
- thumbnail if supported
- task/timeline/source records

Permissions:

- staff only
- assigned player
- position group
- team
- public/showcase if approved

Acceptance:

- Upload can become player task and CoachHelm evidence.

## Strength, Readiness, and Operations Integrations

### TeamBuildr

Purpose:

- Strength programming, lift results, readiness/wellness export, athlete completion.

Ingest modes:

- CSV/XLSX export
- manual import
- API later if credentials exist

Canonical grain:

- workout assignment
- workout result
- exercise result
- readiness/wellness check

Storage:

- performance sessions
- assignments
- results
- exercises
- check-ins
- bodyweight

CoachHelm:

- lift compliance trend
- readiness warning
- heavy lift proximity to game
- missed lift/bodyweight risk
- practice modification suggestion

Acceptance:

- TeamBuildr data feeds Performance and Player Profile.
- It does not require BaseballHelm to rebuild full TeamBuildr in Phase 1.

### ArmCare

Purpose:

- Arm strength, fatigue, recovery, readiness, throwing guidance.

Ingest modes:

- CSV upload
- manual entry
- PDF/report review

Canonical grain:

- arm care assessment
- readiness metric
- workload recommendation

Storage:

- performance check-ins
- baseball pitcher readiness
- workload events
- player timeline

CoachHelm:

- shoulder/elbow risk signal
- pitcher workload modification
- return-to-throw support

Acceptance:

- ArmCare row can affect pitcher readiness and practice/lift recommendation.

### Teamworks

Purpose:

- Schedule, classes, operations, roster, communication, travel exports.

Ingest modes:

- class CSV
- roster CSV
- calendar CSV/ICS where available
- travel/document upload
- API later if approved

Canonical grain:

- class schedule
- calendar event
- roster snapshot
- travel event
- document/acknowledgement

Storage:

- events
- player classes
- conflicts
- roster source
- acknowledgements
- documents

CoachHelm:

- class conflict warning
- practice assignment conflict
- lift/travel availability signal

Acceptance:

- Imported class schedule creates conflict matrix against practice/lift/game events.

## Spreadsheet, PDF, and Manual Sources

### Google Sheets

Purpose:

- Flexible high school, showcase, and small-program data entry.

Ingest modes:

- CSV export
- XLSX upload
- future Sheets connector if available

Storage:

- depends on mapped grain
- saved mapping profile
- import run and rows

Acceptance:

- User can save a mapping and reuse it.

### Generic CSV/XLSX

Purpose:

- Universal upload fallback.

Ingest:

- user selects target grain or system detects likely grain
- field mapping
- player matching
- validation
- preview

Canonical grains:

- roster
- official game
- season stats
- pitch events
- swing events
- batted-ball events
- lift results
- check-ins
- class schedule
- video index
- player measurables
- practice metrics

Acceptance:

- Generic import never silently commits low-confidence official stats.

### PDF Reports

Purpose:

- Preserve and optionally extract useful report data.

Ingest:

- upload PDF
- store raw source
- OCR/text extraction where available
- manual review
- optional mapping from extracted table

Rules:

- Never silently commit low-confidence PDF extraction.
- PDF can still become source evidence even without parsed rows.

### Manual Entry

Purpose:

- Staff-entered corrections, notes, rows, measurements, and events.

Requirements:

- author
- timestamp
- reason
- affected object
- source trust
- edit history
- rollback/change log

CoachHelm:

- manual entries can inform signals, but confidence and source type must be visible.

## Integration Settings Required In Admin

Each provider/source should expose:

- enabled/disabled
- trusted source level
- allowed ingest methods
- auto-commit threshold
- review roles
- player matching rules
- external ID namespace
- saved field mappings
- default visibility
- expected file schedule if AutoSync
- failure alerts
- sample file download where available
- parser version

## Claude Acceptance Matrix

| Source | Phase 1 requirement | Later expansion |
|---|---|---|
| GameChanger XML | upload/email/manual parser if sample available | AutoSync and API/feed where available |
| GameChanger season CSV | CSV snapshot import | scheduled import if export automation exists |
| StatCrew XML | XML upload parser shape and raw storage | local sync agent and AutoSync |
| Presto/SIDEARM/NCAA XML | official file parser preset | duplicate file destination and official watcher |
| StatBroadcast | source preset and approved file upload | live stats feed if approved |
| TrackMan | CSV/XLSX pitch/batted-ball adapter | API/media sync if credentials exist |
| Rapsodo | CSV/report/PDF/manual-reviewed adapter | API/video sync if access exists |
| Synergy | clip/report link and evidence model | direct integration if approved |
| 6-4-3 Charts | report/video/source preset | deeper export adapter |
| AWRE | video/reference model | metadata sync if approved |
| OnForm | link/upload/annotation model | direct workspace integration if approved |
| Blast | swing CSV adapter | direct device/cloud sync if approved |
| Diamond Kinetics | swing CSV adapter | direct device/cloud sync if approved |
| TeamBuildr | lift CSV/manual adapter | API sync if available |
| ArmCare | CSV/manual/PDF adapter | API sync if available |
| Teamworks | classes/calendar/roster CSV adapter | API sync where program has access |
| Google Sheets | CSV/XLSX saved mapping | direct connector |
| PDF | source preservation and manual extraction | table extraction pipeline |
| Manual | auditable manual source | structured review workflows |

