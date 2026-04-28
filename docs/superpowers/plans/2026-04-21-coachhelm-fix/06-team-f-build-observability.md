# Team F — Build & Observability Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. See `00-orchestration.md` for team boundaries. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stop silently shipping TypeScript errors. Stop silently swallowing handled errors past Sentry. Move rate limiting off in-memory `Map`. Wire CI to actually block bad PRs. Pin DataDog to a real password (or rip the placeholder out).

**Architecture:** Pure infra changes — no schema, no engine, no screens. Can start day 1 in parallel with all other teams. Team F's only dependency is patience: flipping `ignoreBuildErrors` will fail CI until Teams A/B/C/D land. Sequence: F starts → fixes infra → flips the switch as the LAST commit in F (after B and C have landed type-safe).

**Tech Stack:** Vercel Cron, Sentry SDK, Upstash Redis (already a dep), Next.js 16 build config, GitHub Actions.

**Owns (file ownership):**
- `next.config.mjs`
- `src/lib/server-error-logger.ts`
- `src/lib/error-monitoring.ts`
- `src/lib/auth/rate-limit.ts`
- `src/lib/auth/supabase-rate-limit.ts`
- `src/lib/datadog/index.ts`
- `instrumentation.ts`
- `instrumentation-client.ts`
- `pre-deploy-check.sh`
- `.github/workflows/ci.yml`
- `datadog/setup-datadog-user.sql`
- `src/test/lib/server-error-logger.test.ts` (NEW)

**Depends on:** Nothing for the bulk of the work; for the FINAL task (`ignoreBuildErrors: false`), Team B and Team C must be merged.

---

## Pre-flight

- [ ] **Step P1:** Verify `next.config.mjs` actually has the bad flag

```bash
grep -n "ignoreBuildErrors\|ignoreLintErrors\|typescript:" next.config.mjs
```
Expected: `typescript: { ignoreBuildErrors: true }` somewhere ~line 31.

- [ ] **Step P2:** Count `console.error` calls in action layer

```bash
grep -rn "console\.error" src/app/golf/actions/ | wc -l
```
Expected: ~336 per audit. Confirm volume.

- [ ] **Step P3:** Check Upstash Redis is already a dep

```bash
grep -E '@upstash/(redis|ratelimit)' package.json
```
Expected: present.

---

## Task F1: Wire `logServerError` → Sentry

**Files:**
- Modify: `src/lib/server-error-logger.ts`
- Test: `src/test/lib/server-error-logger.test.ts`

Most action files already call `logServerError`, but the implementation may just `console.error`. Make it actually call `Sentry.captureException`.

- [ ] **Step 1: Read current implementation**

```bash
sed -n '1,80p' src/lib/server-error-logger.ts
```

- [ ] **Step 2: Failing test**

```typescript
// src/test/lib/server-error-logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

describe('logServerError', () => {
  it('calls Sentry.captureException with the error and tagged context', async () => {
    const Sentry = await import('@sentry/nextjs');
    const { logServerError } = await import('@/lib/server-error-logger');
    const err = new Error('test');
    await logServerError('test.scope', err, { foo: 'bar' });
    expect(Sentry.captureException).toHaveBeenCalledWith(err, expect.objectContaining({
      tags: expect.objectContaining({ scope: 'test.scope' }),
      extra: { foo: 'bar' },
    }));
  });
  it('does not throw when Sentry is unavailable', async () => {
    vi.doMock('@sentry/nextjs', () => { throw new Error('not loaded'); });
    const { logServerError } = await import('@/lib/server-error-logger');
    await expect(logServerError('x', new Error('y'), {})).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Update implementation**

```typescript
// src/lib/server-error-logger.ts
import 'server-only';

export async function logServerError(
  scope: string,
  error: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  // Always log locally for dev/CI
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(`[${scope}]`, error, context);
  }
  // Forward to Sentry in production (lazy import so test envs don't choke)
  try {
    const { captureException } = await import('@sentry/nextjs');
    captureException(error, {
      tags: { scope },
      extra: context,
    });
  } catch {
    // Sentry unavailable — silently degrade
  }
}
```

- [ ] **Step 4: Test, commit**

```bash
git add src/lib/server-error-logger.ts src/test/lib/server-error-logger.test.ts
git commit -m "feat(observability): logServerError forwards to Sentry with scoped tags"
```

---

## Task F2: Migrate `console.error` → `logServerError` in action files

**Files:**
- Modify: every file under `src/app/golf/actions/` that contains `console.error`

Bulk migration. Run a script, verify, commit per file group.

- [ ] **Step 1: Generate a list of files needing migration**

```bash
grep -lr "console\.error" src/app/golf/actions/ src/app/baseball/actions/ src/app/api/ > /tmp/console-error-files.txt
wc -l /tmp/console-error-files.txt
```

- [ ] **Step 2: Write a one-shot codemod** (or do it manually with Edit per file). Pattern:

```javascript
// Before:
console.error('Failed to do X:', err);
// After:
await logServerError('actions.actionName', err, { contextField: value });
```

Add `import { logServerError } from '@/lib/server-error-logger';` at top of each file.

- [ ] **Step 3: For files with > 5 instances, do batched commits**

```bash
# Example: one commit per action file
git add src/app/golf/actions/insights.ts
git commit -m "refactor(observability): insights.ts uses logServerError instead of console.error"
```

- [ ] **Step 4: After migration, count remaining `console.error`**

```bash
grep -rn "console\.error" src/app/ src/lib/ | wc -l
```
Target: ≤ 20 (acceptable: client-only error boundaries, intentional dev-only debug paths).

- [ ] **Step 5: Final commit grouping the long tail**

```bash
git commit -m "chore(observability): final batch — replace remaining console.error with logServerError"
```

---

## Task F3: Move rate limiting to Upstash Redis

**Files:**
- Modify: `src/lib/auth/rate-limit.ts`
- Modify: `src/lib/auth/supabase-rate-limit.ts` (if separate)
- Test: `src/test/lib/auth/rate-limit.test.ts`

In-memory `Map` is per-instance — bypassable by attackers hitting different Vercel instances.

- [ ] **Step 1: Confirm `@upstash/ratelimit` and `@upstash/redis` envs are configured in Vercel**

```bash
vercel env ls | grep -i upstash
```
If missing, install:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

(Use `vercel env add` per environment.)

- [ ] **Step 2: Failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { rateLimit } from '@/lib/auth/rate-limit';

describe('rateLimit', () => {
  it('uses Redis (not in-memory Map) when UPSTASH env is configured', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://x.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 't';
    // The test should verify Ratelimit is constructed; mock @upstash/redis to assert calls
    // ... mock implementation ...
  });
});
```

- [ ] **Step 3: Refactor `rate-limit.ts`**

```typescript
import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
  : null;

const limiters = new Map<string, Ratelimit>();
function getLimiter(key: string, limit: number, window: string): Ratelimit | null {
  if (!redis) return null;
  const cacheKey = `${key}:${limit}:${window}`;
  if (!limiters.has(cacheKey)) {
    limiters.set(cacheKey, new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window as `${number} ${string}`),
      prefix: `ratelimit:${key}`,
      analytics: true,
    }));
  }
  return limiters.get(cacheKey)!;
}

export async function rateLimit(args: { key: string; identifier: string; limit: number; window: string }): Promise<{ success: boolean; remaining: number }> {
  const limiter = getLimiter(args.key, args.limit, args.window);
  if (!limiter) {
    // Fallback for local dev without Upstash — log warning, allow
    // eslint-disable-next-line no-console
    if (process.env.NODE_ENV === 'development') console.warn('rate-limit: Upstash not configured, allowing all requests');
    return { success: true, remaining: args.limit };
  }
  const { success, remaining } = await limiter.limit(args.identifier);
  return { success, remaining };
}
```

- [ ] **Step 4: Update callers** (the in-memory map versions in `api/admin/log-event/route.ts:24-53` and `api/calendar/feeds/[token]/route.ts:21-48`):

Replace:
```typescript
const ipHits = ipMap.get(ip) ?? 0;
if (ipHits > 100) return new Response('rate limit', { status: 429 });
ipMap.set(ip, ipHits + 1);
```

With:
```typescript
const { success } = await rateLimit({ key: 'admin-log-event', identifier: ip, limit: 100, window: '1 m' });
if (!success) return new Response('rate limit', { status: 429 });
```

- [ ] **Step 5: Test, commit**

```bash
git commit -m "feat(security): rate limit via Upstash Redis (replaces per-instance in-memory Map)"
```

---

## Task F4: Fix DataDog placeholder password

**Files:**
- Modify: `datadog/setup-datadog-user.sql`

- [ ] **Step 1: Decide:** Are you actually running DD postgres monitoring?
  - If YES: replace `'YOUR_SECURE_PASSWORD'` with a real env-supplied password and document the workflow in `RESEND_SETUP.md`-style doc.
  - If NO: delete the file and leave a comment in `datadog/README.md` explaining DD RUM is browser-only.

- [ ] **Step 2: Implement the chosen path. Commit.**

```bash
git commit -m "chore(observability): resolve DataDog setup placeholder (real password OR removal)"
```

---

## Task F5: Verify CI workflow runs the right gates

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `pre-deploy-check.sh`

- [ ] **Step 1: Read the current workflow**

```bash
cat .github/workflows/ci.yml
```

- [ ] **Step 2: Ensure CI runs**:
  - `npm ci`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test` (Vitest unit)
  - `npm run build`

If any of these is missing, add it. Required to gate before merge.

- [ ] **Step 3: Update `pre-deploy-check.sh`**

```bash
#!/bin/bash
set -euo pipefail
echo "→ typecheck"; npm run typecheck
echo "→ lint";      npm run lint
echo "→ unit tests"; npm run test --run
echo "→ build";     npm run build
echo "✓ All gates passed"
```

(Currently it warns on lint and skips tests.)

- [ ] **Step 4: Test by running locally**

```bash
./pre-deploy-check.sh
```

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(ci): pre-deploy + GitHub Actions block on typecheck, lint, test, build"
```

---

## Task F6: Sentry — confirm action-layer errors now show up

After Tasks F1+F2 land, action errors should appear in Sentry. Verify.

- [ ] **Step 1: In a preview deploy, force an action error** (e.g., temporarily make a select fail). Confirm:
  - Sentry "Issues" page shows the new event within 1 min
  - The event has `scope` tag matching `actions.<file>.<fn>`
  - Stack trace points at the right line
- [ ] **Step 2: Revert the test failure.**

- [ ] **Step 3: Document in `RESEND_SETUP.md` (or new `OBSERVABILITY.md`)** the convention: every catch in an action calls `logServerError(scope, err, ctx)`.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs(observability): document action-layer error-logging convention"
```

---

## Task F7: Public storage buckets — coordinate with Team A

Team A's migration A5 already handles the public-bucket-listing issue at the policy level. Team F's job here is the **app-side** consequence: any code path that called `getPublicUrl()` on the `documents` bucket needs to switch to `createSignedUrl()`.

- [ ] **Step 1:** Find all `getPublicUrl` calls on the documents bucket:

```bash
grep -rn "getPublicUrl" src/ | grep -i document
```

- [ ] **Step 2:** Replace with signed URLs (60-min expiry):

```typescript
const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 3600);
```

- [ ] **Step 3:** Test by previewing a real document download path; confirm signed URL works, public URL no longer.

- [ ] **Step 4:** Commit

```bash
git commit -m "fix(security): documents bucket uses signed URLs (was leaking via public URLs)"
```

---

## Task F8: Enable Supabase leaked password protection

Supabase advisor flagged: `auth_leaked_password_protection: disabled`.

- [ ] **Step 1:** Open Supabase Dashboard → Authentication → Policies → Password Protection. Enable "Use HaveIBeenPwned to check passwords."

- [ ] **Step 2:** Re-run advisor:

```
mcp__plugin_supabase_supabase__get_advisors  type: security
```
Confirm the warning is gone.

- [ ] **Step 3:** Document in repo (`docs/security/auth-config.md` — new file):

```markdown
# Auth configuration (mirror of Supabase dashboard settings)
- Leaked password protection: ENABLED (HaveIBeenPwned)
- MFA methods enabled: TOTP, WebAuthn
```

- [ ] **Step 4:** Commit

```bash
git add docs/security/auth-config.md
git commit -m "chore(security): enable HaveIBeenPwned leaked-password protection"
```

---

## Task F9: FINAL — flip `ignoreBuildErrors` to false

⚠️ **Do this LAST.** After Teams A, B, C, D have all landed type-safe code.

- [ ] **Step 1: Confirm typecheck passes from main**

```bash
git pull origin main
npm run typecheck 2>&1 | tee /tmp/typecheck-final.log
```
Expected: zero errors.

- [ ] **Step 2: Edit `next.config.mjs`**

```typescript
// Before:
typescript: { ignoreBuildErrors: true },
// After:
typescript: { ignoreBuildErrors: false },
```

(Same for `eslint: { ignoreDuringBuilds: true }` → `false` if present.)

- [ ] **Step 3: Run a clean build to confirm**

```bash
rm -rf .next
npm run build
```
Expected: green.

- [ ] **Step 4: Commit** — this is the gating commit:

```bash
git commit -m "chore(build): typescript.ignoreBuildErrors=false — type errors now block ship"
```

- [ ] **Step 5: Open PR with the title `chore(build): enable strict CI gates`** referencing the orchestration plan in the body.

---

## Done check

- [ ] `logServerError` forwards to Sentry
- [ ] `console.error` count in `src/app/` ≤ 20 (down from ~336)
- [ ] Rate limiting uses Upstash Redis
- [ ] DataDog placeholder resolved
- [ ] CI runs typecheck + lint + test + build
- [ ] Documents bucket uses signed URLs
- [ ] Leaked password protection enabled
- [ ] `next.config.mjs` `ignoreBuildErrors: false` (LAST commit)
- [ ] PR merged
