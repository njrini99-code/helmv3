# V7 Tool-Specific Parser and Storage Strategy

Every source gets a parser profile. The parser profile decides what the data means, where it is stored, and whether it is official, developmental, scrimmage, practice, video, lift, or class data.

## Parser Registry

Create `src/lib/baseball/importers/registry.ts`:

- `gamechangerCollegeXml`
- `gamechangerSeasonCsv`
- `statcrewXml`
- `prestoXml`
- `ncaaSidearmXml`
- `trackmanPitchCsv`
- `trackmanBattedBallCsv`
- `rapsodoPitchCsv`
- `rapsodoHittingCsv`
- `sixFourThreeReport`
- `synergyReport`
- `awreVideoIndex`
- `blastSwingCsv`
- `diamondKineticsCsv`
- `teamBuildrLiftCsv`
- `armCareCsv`
- `teamworksClassesCsv`
- `googleSheetsCsv`
- `genericCsv`
- `pdfExtractReview`

Each importer implements:

- detect
- parse
- normalize
- validate
- match players
- preview commit
- commit
- rollback

## Storage Separation

### Official Games

Store official game records in:

- `baseball_games`
- `baseball_box_score_batting`
- `baseball_box_score_pitching`
- new `baseball_box_score_fielding`
- new `baseball_box_score_catching`
- new `baseball_box_score_baserunning`
- new `baseball_plate_appearances` when play-by-play exists
- new `baseball_pitch_events` when pitch-level exists

### Scrimmages

Scrimmages should not pollute official game stats unless the coach explicitly includes them in development views.

Store scrimmage records with:

- `baseball_games.game_type = scrimmage`
- stat scope `scrimmage`
- official flag false
- source trust coach_reviewed or vendor_development

Views:

- Official stats
- Scrimmage stats
- Combined development view
- Game-only development trend
- Scrimmage-to-game transfer trend

### Practices

Practice stats should be stored by:

- practice event
- block
- station
- rep context
- player
- metric
- source
- coach owner

Do not dump practice metrics into official stat tables.

### Player Profile Bests

Player profile fields such as exit velo, pitch velo, pop time, sixty, bodyweight, and strength maxes should be "current verified bests" sourced from underlying measurement rows.

Never make the profile field the only record.

## Game vs Scrimmage UX

Stats Center tabs:

- Official Games
- Scrimmages
- Practices
- Development Metrics
- Imports
- Source Health

Player profile stat toggle:

- Official
- Scrimmage
- Practice
- All Development

CoachHelm must always state which scope it used.

## Calendar Attachment

Every import should be attachable to:

- existing game event
- existing practice event
- new game
- new scrimmage
- new practice
- player-only development session

If the imported file contains date/opponent but no matching calendar event, BaseballHelm should suggest creating or linking one.

## Source-Specific Commit Examples

GameChanger college XML:

- Creates/updates game.
- Writes official box score.
- Writes play-by-play if included.
- Creates postgame review.
- Updates official season stats.

GameChanger season CSV:

- Writes season snapshot.
- Does not create fake game logs.
- Updates player profile snapshot if configured.
- Creates "historical import" timeline event.

TrackMan pitch CSV:

- Writes pitch events.
- Links to game/scrimmage/practice/bullpen.
- Generates command, shape, fatigue, and pitch mix signals.

Rapsodo hitting CSV:

- Writes batted-ball and hitting session facts.
- Updates verified max/average exit velocity.
- Generates swing/contact development signals.

TeamBuildr lift CSV:

- Writes lift session/result history.
- Updates exercise load charts.
- Feeds readiness and practice modification.

Teamworks class CSV:

- Writes player class schedules.
- Creates conflict matrix.
- Feeds practice/lift/travel availability.

## Parser UX

When a file is uploaded:

1. Show detected source with confidence.
2. Show detected grain: official game, season total, pitch event, lift result, class schedule, etc.
3. Show expected target tables.
4. Show player match preview.
5. Show warnings.
6. Show what will happen after commit.

Coaches should feel the system understands the file.

