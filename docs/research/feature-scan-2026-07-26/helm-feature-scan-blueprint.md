# Helm Feature-Scan Blueprint (Testing Agent Handoff)

**Research date:** 2026-07-26  
**Audience:** Agent implementing Playwright + API + DB + visual + a11y scan  
**Do not** mutate production; use local/preview DB.

---

## 1. Goals

Automate detection of feature bugs, permission failures, data inconsistencies, and silent failures across GolfHelm, BaseballHelm, Lift Lab, CoachHelm, and admin surfaces — prioritizing **P0/P1**.

---

## 2. Recommended Playwright projects

| Project | Browser | Viewport | Auth | Scope |
|---------|---------|----------|------|-------|
| `smoke-public` | chromium | 1280×720 | none | marketing, a11y |
| `golf-coach` | chromium | desktop | P-G-HEAD-A | Brief, roster, calendar, qualifiers, Ask |
| `golf-player` | chromium | desktop | P-G-PLY-A1 | rounds, stats, coachhelm player |
| `golf-isolation` | chromium | desktop | A vs B | cross-tenant |
| `golf-assistant` | chromium | desktop | P-G-ASST-A | permission neg |
| `baseball-coach` | chromium | desktop | storageState | existing smoke + caps |
| `baseball-player` | chromium | desktop | storageState | Today |
| `baseball-seeded` | chromium | desktop | fixtures | camps/pipeline/box |
| `lift` | chromium | desktop | lift personas | today/session |
| `mobile-golf` | chromium | 390×844 | coach+player | shell, modals, bottom nav |
| `mobile-baseball` | chromium | 390/430 | existing | geometry |
| `visual` | chromium | desktop+mobile | mixed | tagged screenshots |
| `admin-neg` | chromium | desktop | non-admin | must 403/redirect |

Reuse/extend `playwright.config.ts` projects; keep `workers:1` in CI until suite is stable; prefer `next start` (#953).

---

## 3. Auth-state strategy

1. Global setup seeds DB + creates users.  
2. `storageState` per persona under `playwright/.auth/` (gitignored).  
3. Baseball already has setup project — mirror for golf.  
4. Short-lived sessions; re-auth helper on 401.  
5. Demo gate tests separate (do not pollute seeded team).

---

## 4. Isolation & reset

- One seed run per CI job; tests tagged with `runId`.  
- Mutating tests clean up or use unique titles (`E2E ${runId}`).  
- Isolation project uses Org A vs Org B personas exclusively.  
- Parallelism: shard by product first (golf || baseball), not by random files sharing data.

---

## 5. External mocks

| Service | Strategy |
|---------|----------|
| Anthropic / AI Gateway | Mock `streamText`/`generateText` **or** record/replay; dedicated Ask tests with fixture tool outputs |
| Resend | Mock; never send CRM sequences in scan |
| Gmail | Ensure unconfigured |
| Stripe | Unset; webhook signature tests unit-only |
| Inngest | Mock client or use inngest dev with assert events |
| Sentry/PostHog/Datadog | No-op without keys |
| Push | Skip or mock web-push |
| File imports | Use checked-in sample XML/CSV fixtures |

---

## 6. Global setup / teardown

```
migrate → seed manifest → create auth states → optional warm next start
teardown: export traces/screenshots on fail; optional DB dump of failures
```

---

## 7. Test layers

| Layer | What |
|-------|------|
| Critical smoke (PR) | Auth login golf+baseball; dashboard 200; baseball smoke; public a11y; no console errors on home |
| Full regression (nightly) | Matrix CSV P0/P1 |
| Visual | Dashboards, Brief, stats charts, calendar, roster, mobile nav, empty/error |
| A11y | axe on key pages + forms/dialogs |
| DB asserts | Companion node tests or post-step SQL via service role in runner |
| Console/network monitor | Fail on hydration #418, 500s, uncaught exceptions; allowlist known third-party |

---

## 8. Critical smoke list (implement first)

1. Public `/` loads  
2. Golf login → dashboard  
3. Baseball login → command-center  
4. Golf player login → dashboard  
5. Unauth `/golf/dashboard` → login  
6. Player denied `/golf/dashboard/intelligence`  
7. Coach denied `/golf/dashboard/rounds/new`  
8. Cross-tenant roster ID access denied  
9. Round submit happy path (seeded course)  
10. RSVP update persists after reload  
11. Message send persists  
12. Brief loads without error  
13. Ask read tool metrics match DB  
14. Ask create_focus Confirm → one DB row  
15. Ask Confirm retry idempotent  
16. Qualifier create coach-only  
17. Baseball import sample file  
18. Baseball pipeline stage transition  
19. Public packet token access  
20. Assistant cannot switch golf teams  

(See also CSV first 20.)

---

## 9. Flake reduction

- `next start` not `dev` in CI  
- Deterministic clocks: freeze timezone to team TZ  
- Wait on network idle **or** specific testids — prefer role/testids  
- Disable animations via `useReducedMotion` / reduced-motion emulation  
- Retry only infra failures; do not retry authz tests  
- Quarantine known reds (#953 backlog) with issue links  

---

## 10. CI integration

| Gate | Suite |
|------|-------|
| PR hard | unit, typecheck, lint, build, pgTAP RLS, baseball smoke, public a11y subset |
| PR soft | golf smoke when `E2E_GOLF_*` present |
| Nightly | full chromium + mobile + visual + golf isolation + CoachHelm mocked AI |
| Weekly | mutation/stryker already CircleCI — keep separate |

Artifacts: trace, screenshot, video on fail; seed manifest version; app commit SHA.

---

## 11. Implementation order

1. **Seed golf CI script + auth setup** (unblock)  
2. Console/network fixtures  
3. Smoke 1–8 (authz)  
4. Round/RSVP/message persistence  
5. CoachHelm Brief + Ask mocked  
6. Cross-tenant isolation suite  
7. Baseball seeded write flows (already partly present)  
8. Mobile golf shell  
9. Visual baselines  
10. Expand P2 from CSV  

---

## 12. Observability during scan

- Capture `page.on('console')` / `pageerror`  
- Har for API 4xx/5xx  
- Optional Sentry test project DSN  
- DB row counts before/after mutating tests  

---

## 13. Out of scope for v1 scan

- Live CRM email sends  
- Production AI spend without mock  
- Capacitor native binary  
- Full visual every page  
- Billing entitlements (absent)  
