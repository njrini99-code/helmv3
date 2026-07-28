# Helm Open Questions

**Research date:** 2026-07-26  
Only items that **cannot** be fully answered from GitHub + read-only Supabase.

---

### OQ-001 Which Supabase Auth providers are enabled in production dashboard?
- **Why:** Affects AUTH-010 tests (OAuth/magic link).  
- **Checked:** Auth schema tables empty-ish; code paths email/password dominant; no definitive Auth provider list via MCP.  
- **Unknown:** Google/Apple enabled? Email confirm required?  
- **Who knows:** Platform owner / Supabase Auth settings.  
- **Assumption for testing:** Email/password only unless env says otherwise.

### OQ-002 Preview vs production Supabase — is there a non-prod project?
- **Why:** Safe mutating scans.  
- **Checked:** MCP `list_projects` returned only `Helm-Production`.  
- **Unknown:** Hidden orgs, branch DBs, or local-only.  
- **Who knows:** Founders / Vercel env owners.  
- **Assumption:** Use local `supabase start` or create a branch DB before mutating E2E.

### OQ-003 Exact production Vercel project + which git branch deploys to prod
- **Why:** Confirm researched `main` matches prod.  
- **Checked:** `vercel.json`, repo main activity; Vercel MCP not queried for deployments in this pass.  
- **Assumption:** `main` is prod source of truth.

### OQ-004 Golf assistant_coach enforceable permission set
- **Why:** Permission matrix gaps.  
- **Checked:** staff.role text; head-only switcher; few capability columns vs baseball.  
- **Unknown:** Product-intended assistant limits beyond RLS head policies.  
- **Who knows:** Product owner.  
- **Assumption:** Treat any coach profile as broad UI access; assert RLS/server for destructive actions.

### OQ-005 Guardian as first-class login role
- **Why:** Persona set.  
- **Checked:** baseball player-access guardian flags; settings routes.  
- **Unknown:** Separate guardian accounts vs parent viewing player login.  
- **Assumption:** Defer guardian E2E until clarified; test settings flags only.

### OQ-006 Whether `create-admin-user` edge function is still required / how gated without JWT
- **Why:** RISK-013.  
- **Checked:** verify_jwt=false metadata.  
- **Unknown:** Shared secret inside function body (not fetched).  
- **Action:** Fetch function source in a security review before scan; do not call in tests.

### OQ-007 Realtime publication config per table
- **Why:** Flake in message/task tests.  
- **Checked:** Client hooks subscribe; not full publication list SQL.  
- **Assumption:** Hooks’ tables are published; if flake, verify `supabase_realtime` publication.

### OQ-008 Email confirmation & rate limits in Auth
- **Why:** Signup E2E reliability (issue #1015 rate limit on calendar).  
- **Assumption:** Use pre-confirmed seed users; avoid mass signup in CI.

### OQ-009 Inngest production functions inventory vs local
- **Why:** Async side-effect asserts.  
- **Checked:** client + route exist; not every function traced.  
- **Assumption:** Prefer DB eventual asserts + safety-net rather than Inngest UI.

### OQ-010 CRM `crm_events` keep vs cut (issue #988)
- **Why:** Whether to test CRM event writes.  
- **Assumption:** Do not block scan; treat as non-user-facing.

### OQ-011 Live TrackMan / golf ingest providers readiness
- **Why:** ingest tables 0 rows; provider stubs.  
- **Assumption:** Out of scope for v1 scan.

### OQ-012 iOS Capacitor parity with web routes
- **Why:** Mobile scan scope.  
- **Assumption:** Web responsive scan first; native later.
