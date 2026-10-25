# P016 — Live rounds: verification

Nothing is verified in a browser yet. The unit and component suites named in the manifest pass; the device pass (iPhone SE
to Pro Max, Text Size XXL, dark, reduced motion, Animations off), the WebKit captures and the pgTAP suite
(`supabase/tests/rls/golf_round_live.sql`, written, not run: no stack here) are open.

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never committed) and travel in the PR description; this
table is the committed record of them. One row per file; the label is the file's basename, named by `npm run
clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |
