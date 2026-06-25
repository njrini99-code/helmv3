# V8 AutoSync Feature Plan

## Feature: AutoSync Ingest Gateway

BaseballHelm becomes a trusted downstream destination for official college baseball stat files.

- Accepts SFTP/FTP drops, HTTPS uploads, post-game email attachments, local sync agent uploads, official feed watchers, and manual emergency uploads.
- Stores every raw file before parsing.
- Authenticates each team with unique credentials.
- Queues parser jobs automatically.
- Tracks source, provider, received method, file hash, and validation status.

## Feature: SID Setup Wizard

The coach should not need to understand XML or FTP.

- Coach selects school/team and provider if known.
- BaseballHelm generates team-specific ingest credentials.
- Coach invites SID/athletic communications contact.
- SID receives simple setup instructions.
- Test file verifies the connection.
- AutoSync status changes to connected, warning, failed, or needs review.

## Feature: Official XML First

The first serious target is official game XML.

- Presto/StatCrew-style XML parser first.
- GameChanger college XML support where available.
- Presto roster, game, season, and zipped XML box score import support.
- StatCrew legacy XML support for backfill and migration.
- SIDEARM and StatBroadcast support through duplicate game-file destination, approved access, or official file watcher.

## Feature: Post-Game Email Destination

Every team can have a sync inbox.

- Example: `team-slug@sync.baseballhelm.com`.
- SID/stat software can email final XML/CSV/PDF files.
- BaseballHelm extracts attachments, identifies team, stores files, and runs the parser.
- This is the best fallback when SFTP setup is too heavy.

## Feature: Local Sync Agent

For legacy StatCrew/local workflows, BaseballHelm can use a small desktop agent.

- Staff logs in once.
- Chooses team and watched folder.
- Agent watches local stat computer folders.
- New XML/ZIP files upload automatically.
- Agent shows connection and upload status.

## Feature: Provider Adapter Registry

Every provider gets an adapter that outputs the same internal model.

- Presto adapter
- StatCrew adapter
- StatBroadcast adapter
- SIDEARM adapter
- NCAA XML adapter
- GameChanger XML/CSV adapter
- generic CSV adapter
- PDF box score review adapter

Each adapter detects, parses, validates, normalizes, reports unsupported fields, and provides validation hints.

## Feature: Confidence-Based Auto-Commit

Automation should be trusted, not reckless.

- 98-100% confidence: auto-commit silently and notify coach.
- 95-98% confidence: auto-commit with warning.
- 85-95% confidence: hold for SID/admin or coach review.
- Under 85% confidence: do not commit.

Confidence includes source trust, provider detection, game match, team match, player match, stat validation, conflicts, and historical consistency.

## Feature: Import Review Screen

When automation is uncertain, the system makes review easy.

- Shows game, date, provider, confidence, warnings, matched players, unmatched players, and conflicts.
- Actions include approve, fix mapping, create player, merge game, mark duplicate, reject.
- Every correction improves future imports.

## Feature: Corrections and Diff Handling

Stats change after games. BaseballHelm must handle corrections professionally.

- Same file hash: ignore duplicate.
- Same game, different file hash: treat as potential correction.
- Compare old vs new stat lines.
- Apply if source is trusted and validation passes.
- Recalculate season totals and reports.
- Notify coach/SID if meaningful.

## Feature: Postgame AI Report

After successful import:

- final score and summary
- offensive takeaways
- pitching takeaways
- defensive notes
- player trend alerts
- workload alerts
- series implications
- staff decision items
- player-specific follow-ups

## Feature: AutoSync Monitoring

Internal reliability should be visible.

- files received per team
- import success rate
- parser failure rate
- auto-commit rate
- review-needed rate
- average import time
- correction frequency
- provider-specific failure rate

Alert if a team expected a game but no file arrived, parser failures spike, SFTP auth fails, validation fails, or season totals change unexpectedly.

## Build Phases

1. Manual XML import and raw file storage.
2. Presto/StatCrew parser MVP.
3. Commit engine with duplicate/correction handling.
4. SFTP/HTTPS ingest gateway.
5. Coach/SID setup UX.
6. Email inbox fallback.
7. SIDEARM/StatBroadcast support.
8. Official website watcher fallback.
9. Live stats and play-by-play later.

## MVP Acceptance

An official Presto/StatCrew-style game XML file can be sent to BaseballHelm without coach action, parsed automatically, validated, matched to the right game and players, committed to the database, displayed in the dashboard, and used to generate a postgame report.

