import { NextResponse } from 'next/server';
import { checkSuperAdminAccess } from '@/lib/admin/require-super-admin';
import { fetchAdminRollupA } from '@/app/golf/actions/admin/rollup-a';
import { fetchAdminRollupB } from '@/app/golf/actions/admin/rollup-b';
import { fetchAdminRollupC } from '@/app/golf/actions/admin/rollup-c';

// Debug endpoint: exercises the refactored rollup path and returns detailed
// JSON — success or failure. Admin-gated AND env-gated. The endpoint serializes
// raw Error properties (stack, cause, supabase error extras) which is sensitive
// operational detail; we keep it disabled in prod by default. Flip
// ENABLE_DEBUG_ROLLUP=1 in env to enable for a diagnostic window.

export const dynamic = 'force-dynamic';

function serializeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    const extra = e as unknown as Record<string, unknown>;
    return {
      name: e.name,
      message: e.message,
      stack: e.stack?.split('\n').slice(0, 20),
      cause: e.cause ? serializeError(e.cause) : undefined,
      // Supabase errors stash extra fields directly on the Error instance
      ...extra,
    };
  }
  if (typeof e === 'object' && e !== null) {
    return { ...(e as Record<string, unknown>) };
  }
  return { message: String(e) };
}

async function step<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; label: string; ms: number; preview: unknown } | { ok: false; label: string; ms: number; error: Record<string, unknown> }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    const ms = Date.now() - t0;
    let preview: unknown = '(non-object)';
    if (value && typeof value === 'object') {
      preview = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          Array.isArray(v)
            ? `[array length=${v.length}]`
            : v && typeof v === 'object'
              ? `{object keys=${Object.keys(v).length}}`
              : typeof v === 'string'
                ? v.length > 60 ? v.slice(0, 60) + '…' : v
                : v,
        ]),
      );
    }
    return { ok: true, label, ms, preview };
  } catch (e) {
    const ms = Date.now() - t0;
    return { ok: false, label, ms, error: serializeError(e) };
  }
}

export async function GET() {
  // 0. Env gate — endpoint serializes raw Error internals; disabled by
  // default in prod. Set ENABLE_DEBUG_ROLLUP=1 to enable for a diagnostic
  // window, then unset.
  if (process.env.ENABLE_DEBUG_ROLLUP !== '1') {
    return new NextResponse('Not Found', { status: 404 });
  }

  // 1. Auth gate — THE canonical super-admin gate, not a local re-implementation.
  //
  // This used to read `users.role === 'admin'` itself, which made it a THIRD
  // authorization authority alongside the two `require-super-admin.ts` was
  // written to reconcile after the 2026-07-29 incident (`SUPER_ADMIN_USER_IDS`
  // env var vs the `admin_allowlist` table drifting apart). A `users.role` row
  // is not the same predicate as `public.is_super_admin()`: a user can carry
  // role='admin' without being in the allowlist, and this endpoint serializes
  // raw Error internals.
  //
  // `checkSuperAdminAccess()` rather than `requireSuperAdmin()` because this is
  // a route handler: the probe is the documented non-throwing variant and maps
  // cleanly onto the 401/403 split this endpoint already returned.
  const access = await checkSuperAdminAccess();
  if (!access.allowed) {
    return access.reason === 'unauthenticated'
      ? NextResponse.json({ ok: false, stage: 'auth', error: 'not-authenticated' }, { status: 401 })
      : NextResponse.json({ ok: false, stage: 'auth', error: 'not-admin' }, { status: 403 });
  }

  // 2. Exercise each rollup in isolation
  const results: unknown[] = [];
  const tStart = Date.now();

  const rA = await step('fetchAdminRollupA', () => fetchAdminRollupA());
  results.push(rA);
  if (!rA.ok) {
    return NextResponse.json(
      { ok: false, totalMs: Date.now() - tStart, results },
      { status: 500 },
    );
  }

  const rB = await step('fetchAdminRollupB', () => fetchAdminRollupB());
  results.push(rB);
  if (!rB.ok) {
    return NextResponse.json(
      { ok: false, totalMs: Date.now() - tStart, results },
      { status: 500 },
    );
  }

  // Slice C needs the raw allRoundsMinimal array — re-run A to get real data.
  const aValue = await fetchAdminRollupA();
  const rC = await step('fetchAdminRollupC', () => fetchAdminRollupC(aValue.allRoundsMinimal));
  results.push(rC);
  if (!rC.ok) {
    return NextResponse.json(
      { ok: false, totalMs: Date.now() - tStart, results },
      { status: 500 },
    );
  }

  // Exercise the full getAdminDashboardData path — this is what /golf/admin
  // actually calls. If this throws, the bug is in assembly or the
  // kept-calls block (platformHealth / shot telemetry).
  const { getAdminDashboardData } = await import('@/app/golf/actions/admin-data');
  const rFull = await step('getAdminDashboardData (full)', () => getAdminDashboardData());
  results.push(rFull);

  return NextResponse.json(
    {
      ok: rFull.ok,
      totalMs: Date.now() - tStart,
      results,
      note: 'if all three slices succeed but /golf/admin still fails, the bug is in assembleAdminDashboardData',
    },
    { status: rC.ok ? 200 : 500 },
  );
}
