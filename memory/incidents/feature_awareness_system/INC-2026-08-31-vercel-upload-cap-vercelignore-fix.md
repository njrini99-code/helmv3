# INC-2026-08-31 — Vercel's 15,000-file upload cap was blown through twice

- Feature: `feature_awareness_system`

## What happened

A `vercel deploy` upload exceeded the platform's 15,000-file cap twice:
48,139 files on one attempt and 19,795 files on a later one. Both failures
traced to the same mechanism: `.vercelignore` REPLACES the default ignore
set rather than extending it, so any directory `.gitignore` excluded was
uploaded anyway the moment `.vercelignore` existed at all.

## Fix / where it lives now

`.vercelignore` was grown to explicitly cover the directories those two
rejections named. The upload is now well under the cap.
`.claude/rules/shipping.md` documents the REPLACES-not-extends behavior as
the single most expensive fact in that section, and requires `--archive=tgz`
on every `vercel deploy` regardless (it also avoids a separate 10 MB
request-body limit).
