# W16: Feature Health Board — `/admin/health` dot grid + Overview rollup

**Goal:** A cream+green Feature Health board: green/amber/red/neutral dot grid for all 37 GolfHelm + CoachHelm features (grouped by app), per-feature error/activity summarization card, drill-in to the Errors tab filtered by feature, and a compact health rollup on the Overview — computed with hysteresis from `get_feature_health()` + Sentry + activity, per the noise charter (a blip never flips a dot; warnings never drive a dot; empty reads NEUTRAL, never red).

**Spec:** `docs/superpowers/specs/helm-bridge/FEATURE_COVERAGE.md` §3 (state machine + thresholds) and §4 (board design) are canonical — the classifier and UI implement them verbatim.

**Depends-on:** W15 Tasks 1–3 (migration applied, `feature` emitted, `feature-registry.ts`), W4 (Fairway admin shell/panel pattern), W6 (Errors tab URL-persisted filters), W5 (Overview).

**PR-scope:** ONE PR (data layer + page + rollup); the Errors-tab filter param may split out if review prefers.

**Hard rules:**
- `requireSuperAdmin()` is the FIRST LINE of the page (src/lib/admin/require-super-admin.ts:8,42).
- The RPC is called with the USER-SCOPED server client (`createClient()` from `@/lib/supabase/server`) — `is_super_admin()` gates on `auth.uid()`; the service-role client would be rejected (same as W3's `get_active_sessions`).
- Dots use the fw-status trio + icon + label — NEVER color alone (StatusPill contract, src/components/fairway/controls/status-pill.tsx:7-10, tones at :30-37).
- Only `error`+`critical`-derived state may render red or reach the Overview banner; warnings/RLS-denial counts appear on drill-in only (charter N3).
- Baseball renders as a single static "paused" note — no data fetch, no dots, no baseball code touched.

---

### Task 1 — `src/lib/admin/data/feature-health.ts` (classifier + data layer)

**Files**
- Create: `src/lib/admin/data/feature-health.ts`
- Create: `src/lib/admin/data/__tests__/feature-health.test.ts`

**Interfaces**
```typescript
import 'server-only';                     // same convention as data/overview.ts
export type FeatureStatus = 'green' | 'amber' | 'red' | 'neutral';
export type FeatureTrend = 'improving' | 'flat' | 'worsening';

export interface FeatureHealthInputs {           // one registry feature's raw signals
  key: FeatureKey;
  tier: FeatureTier;
  seasonalEmpty: boolean;
  neverNeutral: boolean;
  events24h: { total: number; errors: number; criticalUnresolved: number; warnings: number;
               fingerprints: number; rlsDenials: number; rlsDenialFingerprints: number; rlsDenialUsers: number };
  fingerprintsPrev24h: number;
  errorsPrev24h: number;
  fingerprints7d: number;
  integrityStatus: 'pass' | 'fail' | null;
  heartbeatLastActivity: string | null;          // ISO from RPC
  sentryUnresolved: { total: number; critical: number } | null;  // null = Sentry unavailable (degrade to DB-only, never red-by-absence)
  primaryTableWrites7d: number | null;           // empirical tier input; null = unknown → static tier
  now: Date;
}

export interface FeatureHealth {
  key: FeatureKey; app: FeatureApp; label: string;
  status: FeatureStatus; trend: FeatureTrend;
  reason: string;                                // one-line why (drives the card + a11y label)
  summary: string;                               // §4 template string
  topSignatures: Array<{ fingerprint: string; title: string; count: number; lastSeen: string; severity: 'error' | 'critical' }>;
  drillIn: { warnings24h: number; rlsDenials24h: number; heartbeatAgeHours: number | null };
}

export function computeFeatureStatus(i: FeatureHealthInputs): { status: FeatureStatus; trend: FeatureTrend; reason: string };  // PURE — the TDD core
export async function fetchFeatureHealth(): Promise<{ features: FeatureHealth[]; generatedAt: string }>;
// fetch: (1) user-scoped supabase.rpc('get_feature_health', { p_features: rpcInput() });
// (2) Sentry per-feature counts (Task 2 helper) — fail-soft via ok()/failed()/unconfigured() (src/lib/admin/fetch-result.ts);
// (3) map through computeFeatureStatus; sort red → amber → neutral → green within app groups.
```

**Steps**

- [ ] 1. Failing classifier tests — every §3 transition gets a case (this table IS the spec contract):
  - **neutral-first:** seasonalEmpty + zero activity → `neutral` even with stale heartbeat; `neverNeutral` (admin_dashboard) with zero everything → `green`, not neutral.
  - **hysteresis red:** high-tier, fingerprints=6 & fingerprintsPrev24h=1 → `amber` (single window — a blip NEVER reds); fingerprints=6 & prev=5 → `red`.
  - **critical overrides:** criticalUnresolved=1 → `red` immediately any tier; low-tier single critical → `red` (no 2-window grace).
  - **integrity:** integrityStatus='fail' → `red` regardless of fingerprint math.
  - **warnings never color:** warnings=500, fingerprints=0 → `green` (drill-in only).
  - **RLS cluster:** rlsDenials=12 same fingerprint (fingerprints from rls=1, users≥3) → `amber` first window; sustained pattern flag → red-eligible only with prev-window evidence.
  - **low-traffic ratio:** low tier judged on fingerprints7d (1 → amber; 2 → red-eligible) not 24h raw counts.
  - **heartbeat:** med-tier, zero errors, heartbeat 100h stale, primaryTable set → `amber`; same with primaryTable null → `green` (staleness can't amber a heartbeat-less feature); qualifiers' widened 7d window honored.
  - **leaving red:** prev window hot, current window clean → steps DOWN to amber/green per current-window math only (no flap).
  - **trend:** errors24h vs errorsPrev24h ±20% guarded division (NaN-safe, prev=0 & now>0 → worsening; both 0 → flat).
  - **Sentry degrade:** sentryUnresolved=null → status computed from DB only; reason notes "Sentry unavailable".
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/feature-health.test.ts
  ```
  Expected: FAIL — module not found.
- [ ] 2. Implement `computeFeatureStatus` as a priority-ordered rule list (§3.1–3.4), thresholds imported from `feature-registry.ts` constants (NOT inlined — they get recalibrated after 1–2 weeks of tagged data).
- [ ] 3. Implement `fetchFeatureHealth()` (fail-soft per fetch-result.ts envelopes; RPC failure → every feature `neutral` + banner-level "health pipeline degraded" reason, never fake-green, never fake-red).
- [ ] 4. Green + typecheck.

---

### Task 2 — Sentry per-feature counts (verification spike + helper)

**Files**
- Modify: `src/lib/admin/sentry-api.ts` (additive helper only)
- Create/extend: `src/lib/admin/__tests__/sentry-api.test.ts`

**Steps**

- [ ] 1. SPIKE (time-boxed 30 min, result recorded as a comment in sentry-api.ts): does the org issues list endpoint return per-issue `tags` at list scope? If yes → ONE call, bucket client-side by the `feature` tag (emitted since W15 Task 2). If no → fallback: batched parallel queries `is:unresolved feature:<key>` per feature at the existing 60s revalidate window (37 queries; acceptable — document rate-limit headroom).
- [ ] 2. Failing test for the chosen shape:
  ```typescript
  export async function fetchSentryFeatureCounts(keys: readonly FeatureKey[]):
    Promise<Record<string, { total: number; critical: number }> | null>;  // null on any API failure — degrade, never throw
  ```
- [ ] 3. Implement (reuse the existing `fetchSentryIssues({query})` plumbing); green.

---

### Task 3 — `/admin/health` page: dot grid + per-feature card

**Files**
- Create: `src/app/admin/health/page.tsx`
- Create: `src/app/admin/_components/FeatureDotGrid.tsx`
- Create: `src/app/admin/_components/FeatureHealthCard.tsx`
- Create: `src/app/admin/_components/__tests__/feature-dot-grid.test.tsx`
- Modify: `src/app/admin/_components/admin-nav.ts` (add `{ label: 'Health', href: '/admin/health', key: '9' }`; update the "8 tabs" comment)

**Design (spec §4):**
- `page.tsx`: `requireSuperAdmin()` first line → `fetchFeatureHealth()` → two labeled groups ("GolfHelm", "CoachHelm") inside the W4 `PanelBoundary` pattern; cream `#FFFEFA` canvas, helm green `#16A34A` accents; below the groups a static muted note-card: **"Baseball — paused (deferred until prod stabilizes)"**.
- `FeatureDotGrid`: responsive grid of feature chips — `StatusPill` (tone: green→`success`, amber→`warning`, red→`danger`, neutral→`neutral`; `dot` on) + icon (✓/⚠/✕/—) + feature label + trend arrow + 24h grouped count. `aria-label` = `"${label}: ${status} — ${reason}"`. Red first, then amber, neutral, green.
- `FeatureHealthCard` (chip click → expanding card/right rail, client component): healthSignal sentence (registry), status + reason + since-when, summary template line, top-3 signatures (title · count× · lastSeen — ONE line per fingerprint with a count, never N rows), RLS-denial + warning counts (drill-in only), heartbeat age chip, `knownGaps` annotations (e.g. task dual-table bug) rendered as muted "known gap — not an outage" rows, and the drill-in link.

**Steps**

- [ ] 1. Failing component tests: renders 4 tones with icon AND text label (query by role/text, not color); neutral renders "no data" (not red); groups render GolfHelm before CoachHelm; baseball note present, contains "paused", has zero StatusPill dots; red features sort first; card shows top signatures as grouped single lines with counts.
- [ ] 2. Implement page + components (server component page; card interactivity client-side, `_motion-provider` respects reduced-motion like the rest of the shell).
- [ ] 3. Nav: add tab 9 + test that `hrefForShortcut('9') === '/admin/health'`.
- [ ] 4. Green: component tests + `npm run typecheck && npm run lint`.
- [ ] 5. Visual pass in dev against the Fairway bar: matte cards, editorial type, generous whitespace — premium, not dashboard-y.

---

### Task 4 — Drill-in: `feature` filter on the Errors tab

**Files**
- Modify: `src/app/admin/errors/page.tsx` (+ its filter components/query builders)
- Extend: `src/app/admin/errors/__tests__/*`

**Steps**

- [ ] 1. Failing test: `/admin/errors?feature=round_tracking` filters the incident feed to `admin_events.feature='round_tracking'`; the param round-trips through the existing URL-persisted filter set (W6); invalid keys are ignored (no crash, no filter).
- [ ] 2. Implement: add `feature` to the parsed searchParams (errors/page.tsx:40-45 pattern) and to the query/filter chain; render an active-filter chip with a clear ✕.
- [ ] 3. `FeatureHealthCard` "View in Errors →" links to `/admin/errors?feature=<key>`. Green.

---

### Task 5 — Overview rollup (compact, banner-disciplined)

**Files**
- Create: `src/app/admin/_components/FeatureHealthRollup.tsx`
- Modify: `src/app/admin/page.tsx` (mount), `src/lib/admin/data/overview.ts` (compose `fetchFeatureHealth` counts into the snapshot — additive field)
- Create: `src/app/admin/_components/__tests__/feature-health-rollup.test.tsx`

**Steps**

- [ ] 1. Failing tests:
  - renders one compact line: `"Features: {g} green · {a} amber · {r} red · {n} neutral"` + inline chips for red/amber features (max 4, then "+n more") linking to `/admin/health`;
  - **banner discipline (charter N6):** with 0 red features and any number of warnings, the rollup contributes NOTHING to `AdminStatusBanner`; with ≥1 red feature or a new-in-24h fingerprint on a previously-clean feature, it surfaces exactly one banner line;
  - all-green renders a single quiet check line (no celebration wall).
- [ ] 2. Implement; reuse the overview snapshot's fail-soft pattern (`fetchOverviewSnapshot` + `isSignalStale`, src/lib/admin/data/overview.ts:33-37) — health fetch failure degrades the rollup to "health unavailable", never blocks Overview.
- [ ] 3. Green + typecheck + lint.

---

### Task 6 — End-to-end verification sweep

**Steps**

- [ ] 1. `npm run typecheck && npm run lint && npm test` — full green.
- [ ] 2. Dev walkthrough with seeded events (insert synthetic admin_events rows across
  severities/features via the service-role script — scratch, not committed):
  - a feature with 1 error fingerprint in current window only → amber, NOT red (hysteresis observed);
  - same fingerprint across both windows above red line → red; resolve rows via triage → next refresh steps down;
  - warnings-only feature → green dot, warnings visible on card only;
  - RLS-denial cluster → amber + counter on card, no Sentry issue (skipSentry);
  - `/admin/health` as non-super-admin → redirected/denied by `requireSuperAdmin`;
  - RPC as anon (curl with anon key) → permission denied for function.
- [ ] 3. Lighthouse/a11y spot check: dots pass color-independence (icon+label), grid keyboard-navigable, reduced-motion honored.
- [ ] 4. EXECUTION_LOG entry + screenshot of the board for the owner.
