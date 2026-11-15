# Qualifier stress suite (quarantined)

Quarantined on 15 Nov 2026 by the Clubhouse tooling thread (QUEUE row tool-05),
following the 15 Nov UI tooling audit. Nothing here runs.

## Why

Every test in this folder targets the production site
(`https://helmsportslabs.com`, hard-coded in each file and in its config), signs
in with real coach and player passwords, and creates a qualifier and rounds on
the live database. Clubhouse is the only UI for every team now, with real
college teams and players under 18, so a run would write synthetic rows into
real teams' data. Momentic also runs web tests in Chromium, which misses the
iPhone Safari users the suite was meant to protect.

## What was done

- Each `*.test.yaml` is renamed `*.test.yaml.quarantined`, so neither
  `momentic.config.yaml` (`tests/**/*.test.yaml`) nor any other include
  matches it. The steps are unchanged.
- `momentic.qualifier-hell.config.yaml` moved here from the repo root as
  `momentic.qualifier-hell.config.yaml.quarantined`.
- The five run artifacts under `.momentic-mcp/` (a page-state dump, a
  screenshot, a video and two prompts from one production run) are no longer
  tracked. `.gitignore` already ignored the folder; they had been committed
  before that rule. Git history still holds them.

## How to bring it back

Only with the owner's word, and only against staging or a local stack:

1. Point every `url:` and `navigate:` at an environment variable for a staging
   preview or `http://127.0.0.1:3100`, never the production site.
2. Use the staging demo team's accounts, never a real coach or player.
3. Rename the files back (`git mv <f>.quarantined <f>`).

The write journeys that cover the same ground without production are
`e2e/clubhouse-journeys.spec.ts` and `e2e/clubhouse-round.spec.ts` (local
Supabase, nightly in `clubhouse-journeys.yml`).
