# Database Implementation: Business Intelligence Dashboard

## Summary
No new database tables or migrations needed. All BI metrics computed from existing Supabase tables using in-memory JavaScript aggregation.

## Changes Made

### `src/app/golf/actions/admin-data.ts`
1. **Added `BIDashboardData` interface** and 4 supporting interfaces (`BIFunnelStep`, `BITeamHealth`, `BIAtRiskAccount`, `BIConversionProxy`)
2. **Added `bi: BIDashboardData` field** to existing `AdminDashboardData` interface
3. **Added `fetchVercelAnalytics()` helper** — fetches Vercel Web Analytics API for unique visitors (24h/7d/30d), gracefully returns null if unconfigured
4. **Added `buildFunnelSteps()` utility** — computes conversion rates, dropoff counts and percentages from raw stage counts
5. **Added ~450 lines of BI computation** before the return statement, reusing ALL existing query results (zero new database queries)
6. **Added `bi: biData` to return object**

## BI Computation Details

### Growth Section
- Reuses existing signup data, onboarding counts
- Computes median Time-to-First-Value (TTFV) by building playerFirstRound map
- Activation funnel: Signed Up → Onboarded → First Round → Active This Week

### Retention Section
- D1/D7/D30 retention computed from signup cohorts cross-referenced with round activity dates
- 12-week cohort retention matrix
- Login-based DAU/WAU/MAU from users.last_seen
- Coach vs player retention comparison

### Usage Section
- Feature adoption table (all-time + 30d counts for 12 features)
- Dead features detection (<5% of max feature usage in 30d)
- Feature-retention correlation (lift analysis for rounds, reviews, AI insights)
- Object creation by week trends

### Funnel Section
- Player onboarding: Account → Onboarding → Team → First Round → Stats → 3+ Rounds
- Coach onboarding: Account → Onboarding → Philosophy → First Review → Active This Week
- Automated biggest drop-off detection
- Errors classified by feature area

### Health Section
- Team health scores (0-100) with A-F grades
- Power user identification (top 10% by 30d activity)
- At-risk accounts with risk scores and signals
- Conversion proxy scores per team

### Vercel Analytics
- External API call running in parallel with BI computation
- Cached with 15-min revalidation
- Gracefully null if env vars missing

## TypeScript Verification
- 0 new errors introduced
- All types properly exported
- Backward compatible with existing code
