# BaseballHelm AutoSync: Zero-Touch College Baseball Stats Integration Plan

_Last updated: June 23, 2026_

## Executive Answer

Yes, BaseballHelm can make stats update automatically after a college program plays a game. The right product is not a screen scraper and not a coach-upload workflow. The right product is a professional **stats ingestion and normalization system** that receives the same official stat files or live stat feeds that already power school athletics websites, live stats pages, NCAA/conference reporting, and provider systems like Presto, SIDEARM, StatBroadcast, StatCrew, and eventually NCAA LiveStats.

The realistic goal is:

> A coach connects BaseballHelm once, usually with help from the SID/athletic communications staff, and then after each game the stats update automatically inside BaseballHelm with no coach action.

The important nuance:

- **Zero coach work after setup:** realistic.
- **Zero school/provider setup:** unrealistic.
- **Zero scraping:** realistic if BaseballHelm is built around official XML/file/feed ingestion.
- **Universal plug-and-play across every college on day one:** not realistic.

The fastest professional wedge is:

1. Build a **Presto/StatCrew-style XML ingest pipeline**.
2. Give each team a **BaseballHelm SFTP/FTP/HTTPS destination**.
3. Let the SID/stat crew add BaseballHelm as a stat partner or post-game destination where supported.
4. Normalize the official game files into BaseballHelm.
5. Add SIDEARM, StatBroadcast, NCAA/official-site monitoring, and fallback adapters over time.

---

## Difficulty Assessment

### Overall Difficulty

**7/10 to build a real production AutoSync system.**

It is not impossible. It is very buildable. But it is not a weekend feature if you want it to be professional, reliable, and trusted by college programs.

### Difficulty by Version

| Version | Description | Difficulty | Why |
|---|---:|---:|---|
| V0 | Manual CSV/XML upload | 2/10 | Easy import UI and parser. Not zero-touch. |
| V1 | Presto/StatCrew XML import through SFTP or HTTPS | 4.5/10 | Official files, structured data, manageable scope. |
| V2 | Post-game email/file destination | 5/10 | Simple UX, but attachment parsing and routing need care. |
| V3 | Presto Stat Partner-style live/final feed | 6/10 | Professional, but setup and provider variability matter. |
| V4 | SIDEARM client-approved game-file ingestion | 7/10 | Possible, but less publicly self-serve than Presto. |
| V5 | Official website structured file watcher | 7.5/10 | Works, but provider layouts change. Needs monitoring. |
| V6 | Full provider-agnostic AutoSync across Presto, SIDEARM, StatBroadcast, StatCrew, NCAA, PDFs, and websites | 8.5/10 | Many edge cases, mappings, corrections, and data conflicts. |
| V7 | Live in-game stat sync with play-by-play and instant coach dashboards | 9/10 | Real-time reliability, event models, and provider access become much harder. |

### My Recommendation

Do not try to build the universal version first.

Build this in stages:

1. **V1: Official XML ingest.**
2. **V2: Team AutoSync setup wizard.**
3. **V3: Presto-specific onboarding.**
4. **V4: Post-game final stats automation.**
5. **V5: SIDEARM/StatBroadcast/official-site expansion.**
6. **V6: Live data, deeper play-by-play, and AI reports.**

---

## What Is Actually Happening in the College Baseball Stats Ecosystem

Most college baseball stats are not typed manually into the public website after the game. Usually, someone scores the game or generates an official stats file, then that file/feed powers multiple downstream systems.

Typical flow:

```text
SID/stat crew scores game
        ↓
Scoring/stat software creates live or final stat artifact
        ↓
Artifact/feed goes to:
  - school athletics website
  - live stats page
  - NCAA/conference reporting
  - StatBroadcast
  - Presto/SIDEARM website system
  - opponent/SID records
        ↓
Website updates box score, player stats, season stats, and sometimes career stats
```

BaseballHelm should insert itself here:

```text
Official game/stat artifact
        ↓
School website + BaseballHelm
```

or:

```text
Official game/stat artifact
        ↓
BaseballHelm ingest endpoint
        ↓
BaseballHelm dashboards, reports, trends, and AI insights
```

---

## Core Product Thesis

BaseballHelm AutoSync should be built as:

> A trusted downstream destination for official college baseball game files, live stat feeds, post-game XML, and provider-approved stat outputs.

Do not position it as:

> “We scrape your stats page.”

Position it as:

> “BaseballHelm receives the same official game files that already power your athletics website and turns them into coaching intelligence.”

---

## Professional vs. Risky Integration Methods

### Professional Methods

These should be the foundation:

1. **Provider-approved SFTP/FTP destination**
   - School/provider sends XML/game files to BaseballHelm.
   - Best for Presto, StatCrew-style workflows, and potential StatBroadcast setups.

2. **HTTPS ingest endpoint/webhook**
   - School/provider sends files or JSON payloads to BaseballHelm.
   - Cleaner than FTP long-term, but some sports systems still rely on FTP.

3. **Official game XML import**
   - BaseballHelm receives official single-game stat files.
   - Best first build.

4. **Official season XML/summary import**
   - Useful for backfilling historical stats.

5. **Post-game email destination**
   - SID/stat software emails final stat files to a BaseballHelm team inbox.
   - Great fallback and easy to explain.

6. **Client-approved provider feed**
   - SIDEARM/Presto/StatBroadcast grants or allows access for a specific school.

7. **Local sync agent**
   - Small BaseballHelm desktop app watches a stat computer folder and uploads new XML files.
   - Especially useful for legacy StatCrew setups.

### Acceptable Fallback Methods

These can be used carefully:

1. **Official website structured file watcher**
   - BaseballHelm checks official schedule/box score pages and imports official linked XML/HTML/PDF box score files.

2. **Official public NCAA/stats pages**
   - Useful for verification and backfill.

3. **PDF table extraction**
   - Works as a safety net, not as the main product promise.

### Methods to Avoid as Core Architecture

Avoid building your core system around:

1. Logging into provider admin portals with stored customer passwords.
2. Reverse-engineering private APIs.
3. Aggressive scraping of rendered HTML tables.
4. GameChanger private/API scraping.
5. Anything that breaks when a website redesigns.
6. Anything that violates provider terms.

---

## Provider Strategy

## 1. PrestoSports / PrestoStats

### Why Presto Should Be First

Presto is the best first target because its public documentation already aligns with the concept of pushing stats to outside destinations.

Relevant facts:

- Presto Stat Partners allows live stats to be pushed to any provider.
- Presto has worked with NCAA, ESPN, SIDEARM, CBS, College Hockey Stats, XOS Digital, Stretch Internet, and other destinations.
- Presto allows open FTP fields for other third-party sites.
- PrestoWeb exposes stats-related reports such as roster files, season XML summaries, zipped XML box scores, and packed files.
- PrestoSync is already a local sync-style tool used in the Presto ecosystem.

### BaseballHelm Presto Integration Model

Preferred flow:

```text
PrestoStats
    ↓
Stat Partners / FTP destination
    ↓
BaseballHelm SFTP/FTP endpoint
    ↓
BaseballHelm XML parser
    ↓
Normalized game stats
    ↓
Dashboards + AI report
```

### Setup Experience

BaseballHelm generates:

```text
Provider Name: BaseballHelm
Protocol: SFTP or FTP
Host: ingest.baseballhelm.com
Username: team-specific username
Password/API Key: team-specific secret
Path: /incoming/{organization_id}/{team_id}/{season_id}/
Post-game email fallback: team-slug@sync.baseballhelm.com
```

SID/stat crew adds BaseballHelm as a destination once.

### Build First

- Presto XML parser.
- Presto roster file parser.
- Presto game XML parser.
- Presto season XML parser.
- Zipped XML box score importer.
- SFTP receiver.
- File fingerprinting and duplicate detection.

### Why This Is a Good Sales Wedge

You can say:

> “If you use Presto, BaseballHelm can be configured as a stats destination so your coaches do not need to upload anything after games.”

---

## 2. SIDEARM Sports

### Reality

SIDEARM is often the athletics website and fan-engagement layer, not always the original scoring system. But SIDEARM stats are clearly driven by uploaded game/stat files. Public SIDEARM material says career stats can be updated from individual game files uploaded after each contest, with season/team XML as a fallback.

### Best SIDEARM Integration Routes

#### Route A — Client-approved SIDEARM/game-file access

```text
SIDEARM or school provides approved access to game files/feed
        ↓
BaseballHelm pulls/receives official game files
        ↓
BaseballHelm parses and imports
```

This is most professional but may require a relationship or support process.

#### Route B — Duplicate the file sent to SIDEARM

```text
SID/stat crew already uploads official game file to SIDEARM
        ↓
SID/stat crew also configures BaseballHelm as destination
        ↓
BaseballHelm receives same file
```

This is probably the most realistic first route.

#### Route C — Official SIDEARM box score/file watcher

```text
BaseballHelm watches official SIDEARM team schedule/stats page
        ↓
New final box score detected
        ↓
Official linked game file/table/PDF imported
```

This is less ideal, but acceptable if done respectfully, rate-limited, and based on public official pages.

### What Not to Promise

Do not promise every SIDEARM school can connect instantly without any SID/provider setup.

Promise:

> “BaseballHelm supports SIDEARM-based programs through approved game-file ingestion, duplicate stat-file destinations, or official final stats monitoring.”

---

## 3. StatBroadcast / StatInput

### Why It Matters

StatBroadcast is common in live stats workflows and can receive stats from other scoring systems, including PrestoStats through FTP settings.

### BaseballHelm Strategy

Build these routes:

1. **Receive the same XML/live stats feed that StatBroadcast receives.**
2. **Integrate with StatBroadcast partner/support flow if available.**
3. **Use official StatBroadcast event pages only as fallback.**

### Flow

```text
Scoring software / PrestoStats / StatInput
        ↓
FTP/XML live stats destination
        ↓
StatBroadcast + BaseballHelm
        ↓
BaseballHelm import + analytics
```

---

## 4. StatCrew / Legacy XML

### Why It Still Matters

A lot of schools have used StatCrew historically. Even as the market shifts, legacy game files and XML patterns matter for backfill and migration.

### BaseballHelm Routes

#### Route A — Direct XML upload/destination

```text
StatCrew creates XML
        ↓
BaseballHelm SFTP/HTTPS/email receives XML
        ↓
BaseballHelm imports
```

#### Route B — Desktop Sync Agent

```text
BaseballHelm Sync Agent installed on stat computer
        ↓
Watches local folder, e.g. C:\STATCREW\LIVEXML\
        ↓
Uploads new/changed XML to BaseballHelm
```

This is powerful because many legacy workflows are local-file based.

---

## 5. NCAA / Conference Reporting

### Role

NCAA/conference reporting is useful for verification, backfill, and mapping, but it should not be your first “live” dependency.

### Use Cases

- Confirm team IDs.
- Backfill schedules/stats.
- Validate season totals.
- Compare BaseballHelm imported stats against official public stats.

---

## Best MVP Scope

## MVP Goal

A college program should be able to connect BaseballHelm once and have final post-game stats update automatically after each game.

### MVP Does Not Need

- Real-time pitch-by-pitch live sync.
- Every provider in the market.
- Perfect historical backfill.
- Full NCAA-wide public stats crawler.
- GameChanger private integration.

### MVP Needs

1. Team setup wizard.
2. SFTP/FTP/HTTPS receiving endpoint.
3. Presto/StatCrew-style XML parser.
4. Roster/player matching.
5. Game duplicate detection.
6. Import confidence scoring.
7. Auto-commit rules.
8. Coach notification.
9. Postgame AI report.
10. Admin review screen.

---

## System Overview

```text
                     ┌──────────────────────┐
                     │   Scoring Software    │
                     │ Presto / StatCrew /   │
                     │ StatBroadcast / etc.  │
                     └──────────┬───────────┘
                                │
                 official XML / live feed / file
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
  School Website          NCAA/Conference          BaseballHelm
  Presto/SIDEARM          Reporting                AutoSync
                                                    Ingest Gateway
                                                        │
                                                        ▼
                                             Raw File Storage
                                                        │
                                                        ▼
                                             Parser + Validator
                                                        │
                                                        ▼
                                             Normalization Layer
                                                        │
                                                        ▼
                                             BaseballHelm Database
                                                        │
                                                        ▼
                                             Dashboards + AI Reports
```

---

## Detailed End-to-End Workflow

## 1. Team Onboarding

### Coach-Facing Flow

The coach sees:

```text
Connect AutoSync
1. Select your school/team
2. Choose your website/stats provider if known
3. Paste your official schedule or stats page
4. Invite your SID/athletics communications contact
5. BaseballHelm verifies the setup
6. AutoSync turns on
```

The coach should not have to understand XML, FTP, Presto, SIDEARM, or StatCrew.

### SID/Admin Flow

SID receives email:

```text
BaseballHelm AutoSync Setup

Your baseball staff has requested automatic stat syncing.

Please add BaseballHelm as a stat destination using the credentials below:

Protocol: SFTP
Host: ingest.baseballhelm.com
Username: {team_username}
Password/API Key: {team_secret}
Path: /incoming/{team_slug}/
Accepted files: game XML, season XML, roster XML, zipped XML box scores
Fallback email: {team_slug}@sync.baseballhelm.com

After sending a test file, BaseballHelm will validate the connection.
```

### Internal Setup Objects

BaseballHelm creates:

- organization
- team
- season
- provider source config
- team ingest credentials
- SFTP folder or object storage path
- team sync inbox
- parser profile
- roster mapping profile
- auto-commit rules

---

## 2. Ingest Gateway

The ingest gateway accepts stat data from multiple transport methods.

### Supported Inputs

| Input Type | Purpose | Priority |
|---|---|---:|
| SFTP/FTP drop | Provider/SID stat destination | High |
| HTTPS upload endpoint | Modern provider integration | High |
| Email attachment inbox | Post-game fallback | High |
| Local sync agent | Legacy StatCrew/local workflows | Medium |
| Official feed watcher | Provider/public official page monitoring | Medium |
| Manual upload | Emergency fallback | Low |

### SFTP/FTP Receiver

Options:

1. Managed SFTP service pointed at object storage.
2. Small dedicated SFTP server container.
3. Cloud provider transfer service.
4. Partner with file-ingest infrastructure provider.

Recommended for MVP:

```text
SFTP server/container or managed SFTP
        ↓
Store raw files in object storage
        ↓
Create imported_file record
        ↓
Trigger parsing job
```

### HTTPS Endpoint

Example:

```http
POST /api/ingest/{team_slug}/stats
Authorization: Bearer {team_ingest_token}
Content-Type: multipart/form-data
```

Accepts:

- `.xml`
- `.zip`
- `.txt`
- `.json`
- `.csv`
- `.pdf` fallback

### Email Inbox

Each team gets:

```text
{team_slug}@sync.baseballhelm.com
```

Email processing:

1. Receive inbound email.
2. Identify team by recipient address.
3. Extract attachments.
4. Store raw attachments.
5. Parse subject/body for provider/game/date clues.
6. Trigger parsing.

### Local Sync Agent

Tiny desktop app:

```text
BaseballHelm Sync Agent
- User logs in once
- Selects team
- Selects watched folder
- Watches for new XML/ZIP files
- Uploads changed files automatically
- Shows connection status
```

Use for:

- StatCrew local folders.
- Small school setups.
- Legacy Windows stat computers.

---

## 3. Raw File Storage

Never parse and throw away the source file.

Store every original file forever unless the school deletes it.

### Storage Path

```text
/orgs/{org_id}/teams/{team_id}/seasons/{season_id}/raw/{source}/{yyyy-mm-dd}/{file_hash}_{original_filename}
```

### Why Raw Storage Matters

- Auditability.
- Reprocessing when parser improves.
- Debugging stat disputes.
- Historical backfill.
- Provider-specific regression testing.

---

## 4. File Identification

Before parsing, identify what the file is.

### Detection Signals

- File extension.
- XML root tag.
- Provider-specific tags.
- Filename pattern.
- Email sender.
- SFTP path.
- Metadata in file.
- Team/opponent names.
- Sport name.
- Date.
- Stat categories.

### File Types

```text
presto_game_xml
presto_season_xml
presto_roster_xml
statcrew_game_xml
statbroadcast_xml
sidearm_game_file
ncaa_game_xml
csv_game_stats
gamechanger_csv
pdf_box_score
unknown_xml
unknown_zip
```

### Output

```json
{
  "detected_source": "presto",
  "detected_type": "game_xml",
  "confidence": 0.94,
  "sport": "baseball",
  "game_date": "2026-03-15",
  "teams_detected": ["Lynchburg", "Averett"]
}
```

---

## 5. Parser Layer

Each provider gets an adapter. Every adapter outputs the same internal normalized model.

### Parser Interface

```ts
interface StatsParser {
  provider: string;
  canParse(file: RawFile): Promise<DetectionResult>;
  parse(file: RawFile): Promise<ParsedGame | ParsedSeason | ParsedRoster>;
  validate(parsed: ParsedObject): Promise<ValidationResult>;
}
```

### Initial Parser Priority

1. Generic NCAA-style game XML.
2. Presto game XML.
3. Presto season XML.
4. Presto roster XML.
5. StatCrew game XML.
6. ZIP of XML box scores.
7. CSV fallback.
8. PDF fallback.

### Normalized Parser Output

```ts
type ParsedGame = {
  provider: string;
  sourceFileId: string;
  game: {
    externalGameId?: string;
    date: string;
    startTime?: string;
    homeTeam: ParsedTeam;
    awayTeam: ParsedTeam;
    neutralSite?: boolean;
    venue?: string;
    final: boolean;
    innings: number;
    homeScore: number;
    awayScore: number;
  };
  battingLines: ParsedBattingLine[];
  pitchingLines: ParsedPitchingLine[];
  fieldingLines: ParsedFieldingLine[];
  baserunningLines?: ParsedBaserunningLine[];
  plays?: ParsedPlay[];
  teamTotals: ParsedTeamTotals;
  metadata: Record<string, unknown>;
};
```

---

## 6. Normalization Layer

Provider files will not match your database exactly. Normalize everything into BaseballHelm’s canonical model.

### Canonical Objects

```text
Organization
Team
Season
Game
Opponent
Player
Roster Entry
Player Mapping
Team Mapping
Batting Line
Pitching Line
Fielding Line
Baserunning Line
Play/Event
Import Batch
Import Issue
```

### Canonical Game Identity

A game should be deduped using a composite identity:

```text
team_id
season_id
game_date
opponent_normalized_name
home_away_neutral
scheduled_game_number_for_day
doubleheader_game_number
provider_external_game_id
final_score
```

### Why This Matters

Doubleheaders can produce two games on the same day against the same opponent. Weather delays can move games. Neutral-site tournaments can confuse home/away. You need multiple signals.

---

## 7. Player Matching

Player matching is one of the hardest parts.

### Matching Signals

- Exact full name.
- Normalized full name.
- Jersey number.
- Position.
- Class/year.
- Bats/throws.
- Hometown.
- Existing roster IDs.
- Provider-specific player ID.
- Previous stat import history.

### Matching Confidence

Example:

```text
Exact name + jersey number match: 0.99
Exact name only: 0.92
Last name + jersey + position: 0.85
Initial + last name + jersey: 0.78
Last name only: 0.55
```

### Output Example

```json
{
  "source_player_name": "J. Smith",
  "matched_player_id": "player_123",
  "matched_name": "Jake Smith",
  "confidence": 0.87,
  "issue": "Possible duplicate: John Smith also on roster"
}
```

### Product UX

The first import may need review:

```text
27 players matched
2 need review
1 new player detected
```

After mappings are saved, future imports get easier.

---

## 8. Validation Layer

Do not auto-update the dashboard until stats pass validation.

### Validation Checks

#### Game-Level Checks

- Final score matches team totals.
- Innings make sense.
- Home/away teams detected.
- Opponent matched.
- Game date valid.
- Duplicate game not already imported.
- Doubleheader handled.

#### Batting Checks

- Team AB/R/H/RBI totals match box score.
- PA logic mostly makes sense if available.
- Player totals add to team totals.
- No impossible stat values.

#### Pitching Checks

- Pitching innings sum to game length.
- Runs/earned runs match score context.
- Decisions match final score.
- Pitcher order is preserved if available.

#### Fielding Checks

- Errors match team totals.
- Putouts roughly align with innings played.
- Catcher stats checked if available.

#### Import Conflict Checks

- Existing game already has different stats.
- File is older than an already imported correction.
- Source says unofficial/live but database has final.
- Same player mapped to two people.

### Validation Result

```json
{
  "validation_score": 0.97,
  "status": "auto_approved",
  "issues": [
    {
      "severity": "warning",
      "message": "One player matched by initial and last name only"
    }
  ]
}
```

---

## 9. Confidence Engine

BaseballHelm should not blindly commit imported stats. Use confidence thresholds.

### Suggested Thresholds

| Confidence | Action |
|---:|---|
| 98–100% | Auto-commit silently and notify coach. |
| 95–98% | Auto-commit and flag minor warning. |
| 85–95% | Hold for SID/admin review or limited coach review. |
| Under 85% | Do not commit. Mark import failed/needs setup. |

### Confidence Inputs

```text
source trust level
file type trust level
provider detection confidence
game match confidence
team match confidence
player match confidence
stat total validation
conflict detection
historical consistency
```

---

## 10. Commit Layer

Once validated, commit stats idempotently.

### Idempotent Design

Every import should be safe to run multiple times.

Use:

- source file hash
- provider game ID
- BaseballHelm game ID
- import batch ID
- source version timestamp
- stat line natural keys

### Commit Flow

```text
Begin transaction
    ↓
Upsert game
    ↓
Upsert opponent/team mapping
    ↓
Upsert player mappings
    ↓
Upsert batting lines
    ↓
Upsert pitching lines
    ↓
Upsert fielding lines
    ↓
Recalculate game totals
    ↓
Recalculate season totals
    ↓
Create import audit log
Commit transaction
    ↓
Queue AI postgame report
```

### Corrections

Stats get corrected. Your system must handle revised files.

If same game receives a new file:

```text
Compare file hash
If same: ignore duplicate
If different but same game: treat as correction
Generate diff
Apply if source is trusted/final
Notify if meaningful change
```

Example notification:

```text
Stats correction detected for Lynchburg vs Averett, March 15.
Updated: Pitcher earned runs changed from 2 to 1.
Season ERA and report were recalculated.
```

---

## 11. Aggregation Layer

After game lines commit, calculate derived stats.

### Team Stats

- Record.
- Runs per game.
- Team AVG/OBP/SLG/OPS.
- Team ERA/WHIP/K-BB%.
- Fielding percentage.
- Situational splits if data supports it.

### Player Stats

- Standard batting stats.
- Standard pitching stats.
- Fielding stats.
- Rolling 3/5/10-game trends.
- Starter vs bench usage.
- Conference/non-conference splits.
- Home/away splits.
- Opponent quality if data exists.

### Coach-Facing Insights

- Who is heating up?
- Who is cooling down?
- Who is being overused?
- Which lineup combinations are producing?
- What changed since last weekend?
- Who needs attention before the next series?

---

## 12. Coach Notification Layer

After successful import:

```text
BaseballHelm AutoSync
Lynchburg vs Averett imported successfully.
Final: Lynchburg 7, Averett 4
27 player stat lines updated
Season stats recalculated
Postgame AI report ready
```

If issues:

```text
BaseballHelm AutoSync needs review.
Game detected: Lynchburg vs Averett
Issue: 2 players could not be confidently matched.
Stats are held until reviewed.
```

---

## 13. AI Postgame Report Workflow

After stats commit:

```text
Game imported
    ↓
Season totals recalculated
    ↓
Trend engine runs
    ↓
AI report generated
    ↓
Coach dashboard updated
```

### Report Sections

1. Final score and game summary.
2. Offensive takeaways.
3. Pitching takeaways.
4. Defensive notes.
5. Player trend alerts.
6. Workload alerts.
7. Series-level implications.
8. Suggested action recommendations for team meeting.
9. Suggested player-specific follow-ups.

### Example Output

```text
Postgame Summary
Lynchburg beat Averett 7–4. The offense created pressure early with 6 hits in the first four innings and finished with 4 extra-base hits.

Player Trend Alert
Jake Smith is 8-for-17 over his last five games with three extra-base hits. His rolling OPS is up 220 points over that span.

Pitching Workload Alert
Reliever A has appeared in 3 of the last 4 games and threw 29 pitches today. Consider availability review before tomorrow.
```

---

## Database Schema Plan

Below is a suggested schema. Adapt to your current Supabase structure.

## Core Tables

### `organizations`

```sql
id uuid primary key
name text
created_at timestamptz
```

### `teams`

```sql
id uuid primary key
organization_id uuid references organizations(id)
sport text -- baseball, softball
name text
school_name text
division text
conference text
website_url text
created_at timestamptz
```

### `seasons`

```sql
id uuid primary key
team_id uuid references teams(id)
year int
label text -- 2026
status text -- active, archived
created_at timestamptz
```

### `players`

```sql
id uuid primary key
team_id uuid references teams(id)
first_name text
last_name text
display_name text
jersey_number text
position text
class_year text
bats text
throws text
height text
weight text
hometown text
created_at timestamptz
```

### `games`

```sql
id uuid primary key
team_id uuid references teams(id)
season_id uuid references seasons(id)
external_game_id text
game_date date
start_time timestamptz
opponent_name text
opponent_team_id uuid null
home_away text -- home, away, neutral
doubleheader_game_number int null
venue text
status text -- scheduled, live, final, postponed, cancelled
team_score int
opponent_score int
innings int
source_provider text
created_at timestamptz
updated_at timestamptz
```

---

## Source Configuration Tables

### `team_source_configs`

```sql
id uuid primary key
team_id uuid references teams(id)
season_id uuid references seasons(id)
provider text -- presto, sidearm, statbroadcast, statcrew, ncaa, official_website
source_type text -- push, pull, email, local_agent, website_watcher
schedule_url text
stats_url text
live_stats_url text
ingest_mode text -- sftp, ftp, https, email, watcher
is_active boolean
trust_level int -- 1-100
auto_commit_threshold numeric default 0.98
created_at timestamptz
updated_at timestamptz
```

### `ingest_credentials`

```sql
id uuid primary key
team_id uuid references teams(id)
source_config_id uuid references team_source_configs(id)
username text
secret_hash text
api_token_hash text
sftp_path text
email_address text
status text
last_used_at timestamptz
created_at timestamptz
```

### `source_checks`

```sql
id uuid primary key
team_id uuid references teams(id)
source_config_id uuid references team_source_configs(id)
check_type text -- scheduled_poll, file_received, email_received, webhook
status text -- success, failed, no_change
message text
checked_at timestamptz
```

---

## Import Tables

### `imported_files`

```sql
id uuid primary key
team_id uuid references teams(id)
source_config_id uuid references team_source_configs(id)
provider text
file_name text
file_type text
content_type text
storage_path text
file_hash text
file_size_bytes int
received_via text -- sftp, https, email, agent, watcher, manual
received_at timestamptz
status text -- received, parsed, validated, committed, failed, duplicate, needs_review
metadata jsonb
```

### `stat_import_batches`

```sql
id uuid primary key
team_id uuid references teams(id)
season_id uuid references seasons(id)
source_file_id uuid references imported_files(id)
provider text
import_type text -- game, season, roster, correction
status text -- parsing, validating, committed, failed, needs_review
confidence numeric
validation_score numeric
game_id uuid null references games(id)
summary jsonb
created_at timestamptz
committed_at timestamptz
```

### `stat_import_issues`

```sql
id uuid primary key
import_batch_id uuid references stat_import_batches(id)
severity text -- info, warning, error, blocker
issue_type text
message text
source_path text
resolved boolean default false
resolved_by uuid null
resolved_at timestamptz null
created_at timestamptz
```

---

## Mapping Tables

### `player_source_mappings`

```sql
id uuid primary key
team_id uuid references teams(id)
provider text
source_player_id text
source_player_name text
source_jersey_number text
player_id uuid references players(id)
confidence numeric
verified boolean default false
created_at timestamptz
updated_at timestamptz
```

### `team_source_mappings`

```sql
id uuid primary key
provider text
source_team_id text
source_team_name text
team_id uuid references teams(id)
confidence numeric
verified boolean default false
created_at timestamptz
updated_at timestamptz
```

---

## Stat Line Tables

### `batting_lines`

```sql
id uuid primary key
game_id uuid references games(id)
team_id uuid references teams(id)
player_id uuid references players(id)
batting_order int
position text
ab int
r int
h int
rbi int
bb int
so int
doubles int
triples int
hr int
hbp int
sf int
sh int
sb int
cs int
source_import_batch_id uuid references stat_import_batches(id)
created_at timestamptz
updated_at timestamptz
```

### `pitching_lines`

```sql
id uuid primary key
game_id uuid references games(id)
team_id uuid references teams(id)
player_id uuid references players(id)
appearance_order int
ip_outs int
h int
r int
er int
bb int
so int
hr int
hbp int
wp int
bk int
pitches int
strikes int
decision text -- W, L, S, ND
source_import_batch_id uuid references stat_import_batches(id)
created_at timestamptz
updated_at timestamptz
```

### `fielding_lines`

```sql
id uuid primary key
game_id uuid references games(id)
team_id uuid references teams(id)
player_id uuid references players(id)
position text
po int
a int
e int
dp int
pb int
sba int
csb int
source_import_batch_id uuid references stat_import_batches(id)
created_at timestamptz
updated_at timestamptz
```

### `game_events`

```sql
id uuid primary key
game_id uuid references games(id)
inning int
half text -- top, bottom
sequence int
event_text text
event_type text
batter_player_id uuid null
pitcher_player_id uuid null
raw_event jsonb
source_import_batch_id uuid references stat_import_batches(id)
created_at timestamptz
```

---

## Provider Adapter Design

## Adapter Registry

```ts
const adapters = [
  prestoAdapter,
  statcrewAdapter,
  statbroadcastAdapter,
  sidearmAdapter,
  ncaaXmlAdapter,
  gamechangerCsvAdapter,
  genericCsvAdapter,
  pdfBoxScoreAdapter,
];
```

## Adapter Responsibilities

Each adapter must:

1. Detect whether it can parse the file.
2. Extract provider metadata.
3. Parse teams, game, players, and stats.
4. Return normalized objects.
5. Report unsupported fields.
6. Provide validation hints.

## Example Adapter Flow

```ts
async function processImportedFile(fileId: string) {
  const file = await loadImportedFile(fileId);
  const raw = await loadRawFile(file.storagePath);

  const detections = await Promise.all(
    adapters.map(adapter => adapter.detect(raw, file))
  );

  const best = chooseBestDetection(detections);

  if (!best || best.confidence < 0.7) {
    return markNeedsReview(fileId, "Could not identify provider/file type");
  }

  const parsed = await best.adapter.parse(raw, file);
  const normalized = await normalizeParsedObject(parsed);
  const validation = await validateNormalizedImport(normalized);
  const confidence = calculateImportConfidence(best, validation, normalized);

  if (confidence >= autoCommitThreshold) {
    await commitImport(normalized, validation, confidence);
  } else {
    await holdForReview(normalized, validation, confidence);
  }
}
```

---

## AutoSync Job Workflow

## File Push Workflow

```text
Provider sends XML to BaseballHelm
        ↓
Ingest Gateway authenticates team
        ↓
Raw file stored
        ↓
File record created
        ↓
Parser job queued
        ↓
Adapter detects provider/type
        ↓
Stats parsed
        ↓
Game/player/team normalized
        ↓
Validation runs
        ↓
Confidence calculated
        ↓
Auto-commit or review
        ↓
Dashboards update
        ↓
AI postgame report generated
        ↓
Coach/SID notified
```

## Official Website Watcher Workflow

```text
Scheduled game exists today
        ↓
After game start time, watcher checks schedule page every 15–30 minutes
        ↓
Final score or box score link appears
        ↓
Watcher captures official box score/stat file URL
        ↓
Raw file/page stored
        ↓
Parser job queued
        ↓
Same normalization/validation/commit pipeline
```

Use the watcher only as a fallback or for schools without direct feed setup.

## Correction Workflow

```text
New file received for already-imported game
        ↓
File hash differs
        ↓
System treats as potential correction
        ↓
Parse and compare old vs new stat lines
        ↓
If trusted source and validation passes, update stats
        ↓
Create correction log
        ↓
Recalculate season totals
        ↓
Notify coach/SID if meaningful
```

---

## Admin Review UX

The review screen is critical.

### Import Review Screen

Show:

```text
Game: Lynchburg vs Averett
Date: March 15, 2026
Source: Presto game XML
Confidence: 96%
Status: Needs review

Matched players: 27/29
Warnings:
- J. Smith could be Jake Smith or John Smith
- Opponent team name differs from schedule: “Averett Univ.” vs “Averett”
```

Actions:

- Approve import.
- Fix player mapping.
- Create new player.
- Merge with existing game.
- Mark as duplicate.
- Reject import.

### Why This Matters

You cannot guarantee perfect automation at first. But you can make the system learn. Every correction improves future imports.

---

## Coach UX

The coach should never see technical plumbing.

### Connected State

```text
AutoSync: Connected
Provider: PrestoStats
Last successful sync: Today at 5:42 PM
Next scheduled check: After next game
```

### After Game

```text
Stats Updated Automatically
Lynchburg 7, Averett 4
27 player lines updated
Season stats recalculated
Postgame report ready
```

### Warning State

```text
Stats Imported With Warning
2 players need confirmation.
Your dashboard has been updated, but these mappings should be reviewed.
```

### Failed State

```text
AutoSync Needs Attention
BaseballHelm received a file but could not match the game.
Reason: missing opponent/date information.
```

---

## Security and Professionalism

### Authentication

Every team gets unique credentials.

Do not share one global SFTP login.

### Secrets

- Hash secrets.
- Rotate keys.
- Allow revocation.
- Track last used timestamps.

### File Safety

- Virus scan attachments.
- Limit file size.
- Restrict file types.
- Validate XML safely.
- Protect against XML external entity attacks.

### Audit Log

Track:

- who/what sent the file
- when it arrived
- source IP if available
- parser used
- validation result
- committed changes
- corrections

### Rate Limits

For watchers and HTTP endpoints:

- rate-limit by team
- backoff on errors
- avoid heavy polling
- respect provider robots/terms when applicable

---

## Implementation Phases

## Phase 0 — Research and Sample File Collection

### Goal

Get real sample files before writing too much code.

### Tasks

- Collect Presto baseball game XML examples.
- Collect StatCrew baseball game XML examples.
- Collect SIDEARM-published box score examples.
- Collect StatBroadcast examples if possible.
- Collect one or two GameChanger CSV exports for fallback.
- Collect PDF box scores from several schools.
- Build a test corpus.

### Output

```text
/test-fixtures/stats/presto/game_001.xml
/test-fixtures/stats/statcrew/game_001.xml
/test-fixtures/stats/sidearm/boxscore_001.html
/test-fixtures/stats/statbroadcast/game_001.xml
/test-fixtures/stats/gamechanger/season_batting.csv
/test-fixtures/stats/pdfs/boxscore_001.pdf
```

### Difficulty

3/10 if you have friendly coaches/SIDs.

---

## Phase 1 — Manual XML Import

### Goal

Prove BaseballHelm can parse and import official stat files.

### Build

- Upload UI.
- Raw file storage.
- Imported file table.
- Generic XML detector.
- Presto/StatCrew-style game XML parser.
- Game/player matching.
- Admin review screen.
- Commit to stats tables.

### Success Criteria

- Import one official game file.
- Match players.
- Create game.
- Update player/team stats.
- Show import confidence.

### Difficulty

4/10.

---

## Phase 2 — SFTP/HTTPS Ingest Gateway

### Goal

Allow external systems/SIDs to send files directly to BaseballHelm.

### Build

- Team ingest credentials.
- SFTP or managed SFTP drop.
- HTTPS file endpoint.
- Token auth.
- File queue.
- Parser job trigger.

### Success Criteria

- SID can send a file without logging into BaseballHelm.
- BaseballHelm receives and imports automatically.

### Difficulty

5/10.

---

## Phase 3 — Presto AutoSync Beta

### Goal

Make Presto the first polished direct integration path.

### Build

- Presto setup instructions.
- Presto-specific parser hardening.
- Presto roster/season imports.
- Presto test connection flow.
- AutoSync dashboard state.
- Coach/SID notification.

### Success Criteria

- One Presto school can configure BaseballHelm as a stat destination.
- After a game, stats update automatically.
- Coach does nothing.

### Difficulty

6/10.

---

## Phase 4 — Email Inbox Fallback

### Goal

Make post-game automation possible even if SFTP setup is hard.

### Build

- Team sync email addresses.
- Inbound email processing.
- Attachment extraction.
- Email-to-team routing.
- Parsing queue.

### Success Criteria

- SID/stat software sends final stats email to BaseballHelm.
- Stats import automatically.

### Difficulty

5/10.

---

## Phase 5 — SIDEARM Support

### Goal

Support SIDEARM schools professionally.

### Build

- SIDEARM setup path based on client-approved game files.
- Official SIDEARM page/file watcher fallback.
- SIDEARM mapping profiles.
- SIDEARM box score parser if needed.

### Success Criteria

- SIDEARM school can either send same game files to BaseballHelm or have BaseballHelm import official final box scores.

### Difficulty

7/10.

---

## Phase 6 — StatBroadcast/StatInput Support

### Goal

Support schools using StatBroadcast or StatInput workflows.

### Build

- StatBroadcast file/feed adapter.
- Partner setup documentation.
- Official event page fallback.

### Success Criteria

- StatBroadcast-connected game data can update BaseballHelm automatically.

### Difficulty

7/10.

---

## Phase 7 — Official Website Watchers

### Goal

Add automation for schools that cannot configure direct file destinations.

### Build

- Provider detector for team website.
- Schedule watcher.
- Box score link detector.
- Structured table/file parser.
- Rate-limited polling.
- Change detection.

### Success Criteria

- BaseballHelm detects final game and imports stats from official public website with no coach upload.

### Difficulty

7.5/10.

---

## Phase 8 — Live Stats and Play-by-Play

### Goal

Move from post-game automation to in-game or near-real-time coaching intelligence.

### Build

- Live feed receiver.
- Streaming parser.
- Play-by-play event model.
- In-game state model.
- Live dashboard.
- Pitching workload live alerts.
- Lineup/bench decision support.

### Success Criteria

- BaseballHelm updates during the game.

### Difficulty

9/10.

Recommendation: do this later.

---

## Product Packaging

## AutoSync Plan Names

### AutoSync Basic

- Email import.
- Manual fallback.
- Post-game report.

### AutoSync Pro

- Direct SFTP/HTTPS feed.
- Presto/StatCrew XML.
- Auto-commit.
- AI reports.

### AutoSync Elite

- Multi-provider support.
- Live stats.
- Advanced trend alerts.
- Opponent scouting.
- Custom integrations.

---

## Sales Positioning

### Simple Pitch

> BaseballHelm connects to the same official stat files that power your athletics website, then automatically updates your coaching dashboard and generates postgame insights after every game.

### Coach-Focused Pitch

> Your staff plays the game. Your SID/stat system posts the stats. BaseballHelm updates automatically. No spreadsheets, no uploads, no manual stat entry.

### SID-Focused Pitch

> BaseballHelm does not change your game-day workflow. We simply become an approved downstream destination for the official XML/stat files you already produce.

### Provider-Focused Pitch

> BaseballHelm helps your client institutions turn official stats into coaching analytics while preserving your system as the source of truth.

---

## Outreach Script to SID

```text
Hey [Name],

[Coach] is setting up BaseballHelm AutoSync so their coaching dashboard updates automatically after games.

We do not need you to change your scoring workflow. The goal is simply to add BaseballHelm as a downstream destination for the same official game/stat files that already power your website or live stats.

BaseballHelm can receive files by SFTP, HTTPS upload, or post-game email. We support official game XML, season XML, roster files, and zipped XML box scores.

Can you let me know what your baseball program uses for stats right now — PrestoStats, SIDEARM, StatBroadcast/StatInput, StatCrew, NCAA LiveStats, or something else?

Once we know that, we can send the exact one-time setup credentials.
```

---

## Provider Outreach Questions

Ask Presto/SIDEARM/StatBroadcast:

1. Can a client-approved third-party platform receive baseball game XML/stat files?
2. Can BaseballHelm be configured as a stat partner/destination?
3. Is SFTP/FTP supported for third-party destinations?
4. Is HTTPS/webhook supported?
5. Can final post-game files be sent automatically?
6. Can live stats XML be sent during the game?
7. What file formats are supported for baseball?
8. Are there schema docs or sample files?
9. Are there partner requirements?
10. Are there rate limits, terms, or branding restrictions?

---

## Edge Cases to Handle

### Schedule/Game Edge Cases

- Doubleheaders.
- Suspended games.
- Resumed games.
- Seven-inning games.
- Mercy-rule games.
- Neutral-site tournaments.
- Home/away flips.
- Weather postponements.
- Opponent changes.
- JV/reserve games accidentally sent.

### Player Edge Cases

- Same last name.
- Same first initial and last name.
- Jersey number changes.
- Midseason roster additions.
- Players not listed on BaseballHelm roster yet.
- Two-way players.
- Pinch runners/defensive substitutions.
- Missing player IDs.

### Stat Edge Cases

- Corrections after final.
- Unofficial live file sent before final.
- Pitchers listed out of order.
- Earned run corrections.
- Defensive substitutions not included.
- Team totals not matching player totals.
- Different providers using different stat abbreviations.

### Technical Edge Cases

- Duplicate files.
- Same game resent after correction.
- Malformed XML.
- ZIP with multiple games.
- Unknown encoding.
- Provider downtime.
- Credentials expired.
- File arrives before roster setup.

---

## Testing Plan

## Unit Tests

- XML detection.
- Provider detection.
- Game parsing.
- Player parsing.
- Batting line parsing.
- Pitching line parsing.
- Fielding line parsing.
- Validation rules.
- Confidence scoring.
- Duplicate detection.

## Integration Tests

- SFTP file received and parsed.
- HTTPS file received and parsed.
- Email attachment received and parsed.
- Correction file replaces prior stats.
- Review flow resolves player mapping.
- Auto-commit above confidence threshold.
- Hold-for-review below threshold.

## Regression Corpus

Store every real-world weird case as a fixture.

```text
fixtures/provider/presto/doubleheader_game_1.xml
fixtures/provider/presto/doubleheader_game_2.xml
fixtures/provider/statcrew/suspended_game.xml
fixtures/provider/sidearm/missing_player_id.html
fixtures/provider/statbroadcast/live_unofficial.xml
```

---

## Monitoring and Reliability

### Metrics

Track:

- files received per team
- import success rate
- parser failure rate
- auto-commit rate
- review-needed rate
- average import time
- correction frequency
- provider-specific failure rate

### Alerts

Alert internal admin if:

- a team expected a game but no file arrived
- parser failure rate spikes
- provider watcher breaks
- SFTP auth failures occur repeatedly
- imported file fails validation
- season totals change unexpectedly

---

## Build Order for an Agent/Developer

## Sprint 1: Foundation

- Add `team_source_configs`.
- Add `ingest_credentials`.
- Add `imported_files`.
- Add `stat_import_batches`.
- Add `stat_import_issues`.
- Add object storage for raw files.
- Build manual upload endpoint.

## Sprint 2: XML Parser MVP

- Build generic XML detector.
- Build Presto/StatCrew baseball game parser.
- Build normalized `ParsedGame` model.
- Create validation functions.
- Create import preview screen.

## Sprint 3: Commit Engine

- Upsert games.
- Upsert players/mappings.
- Upsert batting/pitching/fielding lines.
- Recalculate season stats.
- Add duplicate detection.
- Add correction handling.

## Sprint 4: AutoSync Ingest

- Add SFTP or managed file drop.
- Add HTTPS ingest endpoint.
- Add token authentication.
- Trigger background parser jobs.
- Add import status dashboard.

## Sprint 5: Coach/Admin UX

- AutoSync setup wizard.
- SID invite email.
- Test connection button.
- Import review screen.
- AutoSync connected/failed states.

## Sprint 6: AI Reports

- Trigger report generation after commit.
- Add postgame report table.
- Add coach notification.
- Add trend alert engine.

## Sprint 7: Provider Expansion

- Harden Presto adapter.
- Add email inbox fallback.
- Add SIDEARM adapter/fallback.
- Add StatBroadcast adapter/fallback.
- Add official website watcher.

---

## MVP Acceptance Criteria

The MVP is successful when this is true:

```text
A Presto/StatCrew-style official game XML file can be sent to BaseballHelm without coach action, parsed automatically, validated, matched to the right players/game, committed to the database, and displayed in the dashboard with an AI postgame report.
```

Specific checklist:

- [ ] Team has AutoSync source config.
- [ ] Team has unique ingest credentials.
- [ ] Raw file is stored.
- [ ] Provider/type is detected.
- [ ] Game is parsed.
- [ ] Players are matched.
- [ ] Stats are validated.
- [ ] Import confidence is calculated.
- [ ] High-confidence imports auto-commit.
- [ ] Low-confidence imports enter review.
- [ ] Duplicates are ignored.
- [ ] Corrections are handled.
- [ ] Season totals recalculate.
- [ ] Coach receives postgame report.

---

## Final Recommendation

This is very doable if BaseballHelm starts with the professional file/feed layer instead of trying to scrape everything.

Build the first version around:

1. Official XML/game file ingest.
2. Presto/StatCrew-style parser.
3. Team-specific SFTP/HTTPS/email destinations.
4. Roster/player mapping.
5. Confidence-based auto-commit.
6. AI postgame report.

Then expand into SIDEARM, StatBroadcast, official-site watchers, and live stats.

The product promise should be:

> “Connect BaseballHelm once. After every game, your official stats update automatically and your coaching insights are ready.”

The technical principle should be:

> “Official files first. Provider-approved feeds second. Website parsing only as fallback.”

That gives BaseballHelm the zero-touch coach experience without looking amateur or fragile.

---

## Source Notes

These sources shaped the integration assumptions and should be reviewed by the developer building this system:

- PrestoSports Stat Partners documentation: https://help.prestosports.com/PrestoStats/v1/stat-partners
- PrestoWeb Stats Tab documentation: https://help.prestosports.com/PrestoWeb/v1/stats-tab
- PrestoSync setup documentation: https://help.prestosports.com/PrestoStats/v1/prestosync-setup-and-download
- PrestoStats product overview: https://www.prestosports.com/prestostats/
- PrestoSports Stats Partners product page: https://www.prestosports.com/stats-partners/
- SIDEARM career stats/game-file update note: https://sidearmsports.com/news/2022/8/17/the-playbook-career-stats-upgrades
- SIDEARM live stats control example: https://sidearmstats.com/smith/wvball2/control.aspx
- StatBroadcast PrestoStats setup guide: https://www.statbroadcast.com/support/presto.php
- StatBroadcast support center: https://statbroadcast.com/support/
- StatCrew live stats XML/FTP guide: https://www.statcrew.com/photos/schools/statc/bstasftp.pdf
- StatCrew XML generation FAQ: https://www.statcrew.com/faqs/gamexml.pdf
- Cronkite News report on 2026 college baseball stat software fragmentation: https://cronkitenews.azpbs.org/2026/04/16/college-baseball-software-outage/
