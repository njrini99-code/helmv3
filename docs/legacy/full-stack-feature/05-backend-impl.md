# Backend Implementation: Business Intelligence Dashboard

## Summary
Backend implementation is merged with database implementation (Step 4) since this project uses server actions, not REST endpoints. All backend logic lives in `src/app/golf/actions/admin-data.ts`.

## Key Implementation Details

### Data Fetching Strategy
- Zero new database queries — ALL BI metrics computed from existing query results
- Single new external API call: Vercel Web Analytics (parallel, non-blocking)
- Total BI computation adds ~50ms to existing response time (pure JavaScript aggregation)

### Vercel Analytics Integration
- Requires `VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` env vars
- Optional `VERCEL_TEAM_ID` for team-scoped projects
- Uses `fetch()` with `next: { revalidate: 900 }` (15-min cache)
- Gracefully returns `null` when env vars missing or API fails

### Admin Auth
- No changes needed — existing admin role check already protects all data

### Type Exports
All BI types are exported from `admin-data.ts` for use by frontend components:
- `BIDashboardData`
- `BIFunnelStep`
- `BITeamHealth`
- `BIAtRiskAccount`
- `BIConversionProxy`

## Files Modified
- `src/app/golf/actions/admin-data.ts` — Added BI types, Vercel helper, computation block, return field
