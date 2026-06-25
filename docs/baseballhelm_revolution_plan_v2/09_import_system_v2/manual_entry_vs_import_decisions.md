# Manual Entry Vs Import Decisions


## Import-first product philosophy

Because BaseballHelm will not use direct vendor integrations early, import quality must be a product strength, not a utility screen.

## Standard flow

Upload → detect/import type → map columns → normalize values → match players → preview rows → validate → resolve warnings/blockers → commit → generate source-labeled records → create insights/tasks → audit → allow rollback.

## Severity model

| Severity | Meaning | Example |
|---|---|---|
| Blocking | Cannot safely commit row | No player match and no manual resolution |
| Warning | Can commit with review | Missing jersey, uncommon stat column, duplicate likely |
| Info | Does not need action | Optional column ignored |

## Player matching

Use exact external ID, exact roster match, normalized name + jersey + class, fuzzy name, and manual review. Store match confidence and chosen resolution.

## Duplicate resolution

The same file can be imported twice. Import runs must detect existing source rows and show create/update/skip decisions before commit.

## Rollback

Rollback must reverse records created by an import run when safe. Updates require before/after audit snapshots.


## MVP decision

Roster, schedule, game stats, season stats, pitching metrics, hitting metrics, lift assignments/results, wellness, class schedule, travel itinerary, practice attendance, player development notes, and generic custom import should be supported as templates or near-template flows. Prospect import is deferred until recruiting is active.
