# Assumptions And Constraints

**Hard constraints:** no required direct live integrations in Phase 1; support manual entry, CSV/Excel imports, file uploads, PDF/report uploads, image/video link storage, athlete-entered data, coach-entered data, admin-entered data, and future integration readiness only.

## Assumptions

- The repo is accessible as `njrini99-code/helmv3` and uses the public main branch unless a build agent receives a newer branch.
- Supabase is the primary database and auth layer.
- BaseballHelm and GolfHelm share some app shell, UI, team, and messaging concepts.
- College baseball is the priority product surface for this plan.
- The Phase 1 customer is a real college staff with limited time, incomplete data, and existing spreadsheets.
- Vendor exports differ by school, plan, and device. The import center must be generic first.
- Some current repository documents may be stale; repo audit should be re-run locally before final implementation.

## Non-goals for Phase 1

- Direct Teamworks/ARMS/Hudl/Rapsodo/TrackMan/GameChanger integrations.
- Full NCAA compliance platform.
- Full academic advising system.
- Medical diagnosis or injury prediction.
- Replacing all scoring apps.
- Building pro-level pitch-by-pitch prediction models.
- Player-facing AI that sees staff-only or sensitive notes.
