# V6 Vendor and Tool Integration Matrix

Phase 1 should not build direct vendor integrations unless credentials and APIs already exist. It should build import-ready adapter architecture, source settings, saved mappings, file upload, external IDs, and source-linked downstream actions. That is what makes later integrations cheap without blocking the one-shot build.

## Integration Strategy

Build now:

- Source registry
- Import Dossier
- CSV/XLSX/XML upload
- PDF/text attach and manual extraction workflow
- Source-specific parser interfaces
- Saved mappings
- External player IDs
- Duplicate detection
- Rollback
- Source confidence
- Source drawers
- Integration settings placeholders
- Webhook/API stubs behind disabled feature flags

Do not build now:

- OAuth to every vendor
- background sync to every vendor
- scraped integrations
- unauthorized video/data extraction
- vendor-specific claims that require formal partnership

## Official Stats Sources

### GameChanger College XML

Market note: GameChanger supports XML export for college baseball/softball teams in a standard format accepted by PrestoSports, SIDEARM, and NCAA workflows.

Build behavior:

- XML upload parser.
- Detect teams, game, date, opponent, batting, pitching, fielding if present, play-by-play if present.
- Match college roster by name/jersey/external ID.
- Create or update `baseball_games`, official box score tables, season stats, player timeline, postgame review.
- Mark source trust as official or coach-reviewed depending on program setting.

### StatCrew / NCAA XML

Market note: StatCrew XML workflows remain part of college sports reporting/import/export behavior, though 2026 market instability around college baseball live stats makes flexible import essential.

Build behavior:

- XML parser interface for StatCrew-like game and season files.
- Treat as official source when provided by SID/staff.
- Preserve raw XML.
- Parse game metadata, team totals, player lines, and play-by-play where available.
- Support re-import diff because official scoring corrections happen after games.

### PrestoSports / SIDEARM / NCAA Website Workflows

Build behavior:

- Accept the same XML or CSV exports the website/SID workflow uses.
- Create source presets for PrestoSports and SIDEARM.
- Avoid promising direct API sync unless credentials exist.
- Add export option later: BaseballHelm official stat package can be emitted in accepted XML/CSV formats once schema stabilizes.

### Manual Box Score and CSV

Build behavior:

- Keep current manual entry and CSV upload, but expand beyond batting/pitching.
- Add fielding/catching/baserunning tabs.
- Add source drawer to every stat line.
- Require game identity before official commit.
- Add row-level validation and conflict resolution.

## Tracking and Player Development Sources

### TrackMan

Market note: TrackMan baseball products expose detailed pitch and hitting metrics including ball trajectory, spin, release, movement, plate location, exit speed, launch metrics, and distance. TrackMan glossary pages also show pitch-level fields such as pitcher/batter identity, handedness, pitch rank, teams, and pitch context.

Build behavior:

- CSV upload adapter for pitch and hit files.
- Store pitch events, batted-ball events, sessions, and external IDs.
- Link TrackMan pitch/hit rows to games or practice sessions.
- Do not force official scoring from TrackMan.
- Generate pitch design cards, command maps, hitter damage maps, bullpen decay alerts, and video matching opportunities.

### Rapsodo

Market note: Rapsodo baseball products focus on hitting and pitching development, with metrics around exit speed, hitting/pitching in one device, live-on-live capture, seam orientation, strike zone recognition, and pitch spin profile.

Build behavior:

- CSV upload adapter for pitching and hitting.
- Store as player-development source.
- Support bullpen/cage/live AB sessions.
- Create pitch design, swing/contact, and live-on-live comparison signals.
- If video is exported or linked, store as video event reference.

### Yakkertech / HitTrax / Pocket Radar

Build behavior:

- Generic tracking CSV profile with saved mappings.
- Accept pitch velocity, exit velocity, launch, distance, spray, pitch type, location when present.
- Store enough context to support Player Passport and CoachHelm.

### Blast Motion

Market note: Blast captures swing metrics around plane, connection, rotation, impact metrics, attack angle, bat speed, and on-plane efficiency.

Build behavior:

- Swing sensor import profile.
- Store swing events with context.
- Compare cage swings to game outcomes.
- Flag bat speed drop, attack angle inconsistency, on-plane efficiency changes, and approach mismatch.

### Diamond Kinetics

Market note: Diamond Kinetics bat sensors track swing metrics through mobile app workflows and are associated with barrel speed, acceleration, attack angle, impact momentum, and 3D swing views.

Build behavior:

- Swing event import profile.
- Map max barrel speed, max acceleration, impact momentum, attack angle, contact point.
- Add leaderboard and verified measurement support for showcase mode.

## Video and Scouting Sources

### Synergy Baseball

Market note: Synergy Baseball provides data filtering and video playback for teams, seasons, games, and players. Its video workflow supports clips, custom edits, and playlists.

Build behavior:

- Store Synergy as external video/stat source.
- Allow staff to paste or upload Synergy exports/reports and clip links.
- Create `baseball_video_events` linked to players/games/plate appearances/pitches.
- Do not copy protected video unless permitted; store references and metadata.
- CoachHelm should cite Synergy clips as evidence when the staff has access.

### 6-4-3 Charts

Market note: 6-4-3 Charts integrates Synergy, TrackMan, AWRE, user-logged pitch tracking, and 6-4-3 play-by-play into a single platform used by college programs, leagues, and MLB organizations. Its Synergy, TrackMan Sync, and AWRE products connect stats, video, and visualization.

Build behavior:

- Create source presets for 6-4-3 export, 6-4-3 Synergy, 6-4-3 TrackMan Sync, and 6-4-3 AWRE.
- Import reports/CSV as trusted coaching analytics, not blindly official stats.
- Preserve 6-4-3 play-by-play tags and external video references.
- Use as a benchmark: BaseballHelm should not pretend to replace 6-4-3 immediately; it should integrate/import and then connect the outputs to team ops, practice, strength, classes, and CoachHelm actions.

### AWRE

Market note: AWRE video paired with TrackMan/6-4-3 data is a real college baseball workflow.

Build behavior:

- External video source with clip references.
- Link to TrackMan pitch/hit rows if external IDs/timestamps align.
- Allow coach-tagged video events when automatic matching fails.

### OnForm

Market note: OnForm is a baseball video analysis and coaching tool for recording, analyzing, sharing, drawing, voice-over, messaging, tagging, and automatic capture workflows.

Build behavior:

- External video source.
- Store shared clip links, uploaded coach phone videos, annotations, and player responses.
- Convert an annotated clip into a player task, dev plan item, or CoachHelm evidence object.

## Strength, Readiness, and Operations Sources

### TeamBuildr

Market note: TeamBuildr supports strength programming, custom periodization, athlete mobile delivery, max tracking, exercise videos, reporting, wellness/readiness, soreness, pain, and load monitoring through its broader AMS.

Build behavior:

- Phase 1: CSV import and manual lift entry only.
- Settings preset for TeamBuildr import.
- Store lift assignments/results/readiness in BaseballHelm for baseball decisions.
- Do not rebuild a full TeamBuildr replacement in Phase 1.
- CoachHelm should correlate lift compliance/readiness with baseball performance and availability.

### ArmCare

Market note: ArmCare emphasizes objective arm strength, fatigue, recovery, workload scaling, readiness, and individualized throwing/pitch count guidance. Its public content discusses acute-to-chronic workload concepts and baseball-specific undertraining/overload concerns.

Build behavior:

- Source preset for ArmCare CSV/manual metrics.
- Store shoulder/elbow readiness, strength balance, fatigue, recovery, and individualized pitch/throw constraints.
- Integrate with pitcher workload, bullpen planning, availability, and CoachHelm readiness flags.

### Teamworks

Market note: Teamworks positions itself as an operating system for sports with communication, scheduling, file sharing, workflows, logistics, roster, academics, and compliance/recruiting products. Teamworks Academics supports class schedules via API or manual upload.

Build behavior:

- Do not attempt to replace Teamworks department-wide in Phase 1.
- Add source preset for Teamworks roster/classes/calendar CSV.
- Import class schedules, team events, travel, and roster where available.
- Make BaseballHelm win at baseball-specific action: connect class/lift/stats/video/practice to the baseball staff workflow.

## Generic Sources

### Google Sheets

Build behavior:

- CSV/XLSX upload with saved mapping profile.
- Later direct Sheets connector if available.
- Ideal for high school/showcase programs that track measurables, practice stats, or rosters in spreadsheets.

### PDF Reports

Build behavior:

- Accept PDF attachment.
- Extract text if parser exists; otherwise preserve as source document.
- Let staff manually map rows from extracted text.
- Never silently commit low-confidence PDF extraction to official stats.

### Manual Entry

Manual entry is a source. It needs:

- staff author
- timestamp
- reason
- edit history
- confidence
- affected object
- rollback/change log

## Vendor Adapter Interface

Each adapter should implement:

- `detect(file): DetectionResult`
- `parse(file): ParsedRows`
- `normalize(row): CanonicalImportRow`
- `mapFields(headers, savedMapping): FieldMapping[]`
- `validate(rows, context): ValidationReport`
- `matchPlayers(rows, roster, externalIds): MatchReport`
- `previewCommit(rows): CommitPlan`
- `commit(plan): CommitResult`
- `rollback(importRunId): RollbackResult`

Each adapter should output:

- source category
- import type
- canonical grain
- confidence
- source warnings
- suggested follow-up actions

## Integration Settings UI

Settings should include:

- enabled sources
- source trust tier
- source visibility defaults
- review requirements
- saved mappings
- external IDs
- duplicate behavior
- official stat authority order
- player-submitted data approval policy
- video reference policy
- AI can use source yes/no
- notification thresholds

