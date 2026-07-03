# Open Questions

## Repository / implementation

- Does the production Supabase schema match `src/lib/types/database.ts` exactly?
- Are there private migrations or branches not visible in public static inspection?
- Which existing BaseballHelm pages are actively used by demo users?
- Is CoachHelm AI currently enabled anywhere beyond scripts and dependency setup?
- Which roles exist in production beyond `coach` and `player`?

## Product / market

- Should the first demo customer be JUCO, DII/DIII, NAIA, or DI?
- Does BaseballHelm sell to head coaches directly or athletic department admins?
- Should recruiting be kept later to avoid confusing the team-ops wedge?
- Which CSV import is most likely to unlock immediate demos: roster, stats, practice, lifts, or class schedules?
- Should Phase 1 include PDF upload parsing, or only file storage plus manual extraction?

## Data / privacy

- What academic data can coaches legally/ethically store in the product for target schools?
- What health/injury fields should be avoided or restricted?
- Should players be allowed to edit self-reported wellness after submission?
- What AI summaries should require coach approval before player visibility?
