# W10: Users & Teams + Drill-downs + Read-Only Impersonation

**Goal:** Ship `/admin/users` (cross-sport directory, teams table, at-risk list with CRM link-out), per-user drill-down, and the v1 read-only "view as" — super-admin only, strictly read-only by construction, time-boxed, bannered, audit-logged on enter/exit (owner decision #9).

**Depends-on:** W3 (sessions RPC), W7 (SessionsPanel + revoke), W8 (TeamHealthTable, classifyTeamHealth).

**PR-scope:** ONE PR.

**CRM boundary in force:** the directory has NO email actions; the at-risk list's only action is `<a href="/golf/admin/crm">Open in CRM →</a>` — this is what severs the `PeopleTab.tsx:10 BulkEmailModal` coupling on the new side.

**Impersonation model (safety-first interpretation of decision #9):** "view as" renders the target user's data READ-ONLY inside `/admin` via gated service-role reads. It NEVER mints a session as the user, so writes as the user are impossible by construction — stronger than an action-blocklist. TTL 15 min via HMAC-signed cookie; persistent banner; `audit_log` rows on enter and exit.

---

### Task 1 — Users & teams data layer

**Files**
- Create: `src/lib/admin/data/users.ts`
- Create: `src/lib/admin/data/__tests__/users.test.ts`

**Interfaces**
- Produces:
  ```typescript
  export interface DirectoryUser {
    id: string; email: string; role: string; createdAt: string | null; lastSeen: string | null;
    sports: Array<'golf' | 'baseball'>;
  }
  export function classifyAtRisk(user: { lastSeen: string | null; createdAt: string | null }, now: Date):
    'active' | 'at-risk' | 'never-seen';
  export async function fetchUsersTab(filters: { q?: string; role?: string; team?: string }): Promise<{
    users: DirectoryUser[];
    teams: Array<GolfTeamHealthRow & { sport: 'golf' | 'baseball' }>;
    atRisk: DirectoryUser[];
  }>;
  export async function fetchUserDetail(userId: string): Promise<{
    user: DirectoryUser | null;
    memberships: Array<{ sport: 'golf' | 'baseball'; teamId: string; teamName: string }>;
    recentActivity: Array<{ kind: string; at: string; label: string }>;
    authEvents: Array<{ id: string; title: string; event_type: string; created_at: string }>;
    errorEvents: Array<{ id: string; title: string; severity: string; created_at: string; fingerprint: string | null }>;
  }>;
  ```
- Consumes: `createAdminClient`, `classifyTeamHealth` (W8), `fetchActiveSessions` (W7) at the page level.

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/data/__tests__/users.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { classifyAtRisk } from '@/lib/admin/data/users';

  const now = new Date('2026-07-01T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

  describe('classifyAtRisk', () => {
    it('active when seen within 14d', () => {
      expect(classifyAtRisk({ lastSeen: daysAgo(3), createdAt: daysAgo(100) }, now)).toBe('active');
    });
    it('at-risk past 14d inactivity', () => {
      expect(classifyAtRisk({ lastSeen: daysAgo(20), createdAt: daysAgo(100) }, now)).toBe('at-risk');
    });
    it('never-seen when lastSeen is null and account is older than 3d (grace for fresh signups)', () => {
      expect(classifyAtRisk({ lastSeen: null, createdAt: daysAgo(10) }, now)).toBe('never-seen');
      expect(classifyAtRisk({ lastSeen: null, createdAt: daysAgo(1) }, now)).toBe('active');
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/users.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/data/users.ts`:
  ```typescript
  import 'server-only';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { classifyTeamHealth, type GolfTeamHealthRow } from '@/lib/admin/data/golf';

  export interface DirectoryUser {
    id: string;
    email: string;
    role: string;
    createdAt: string | null;
    lastSeen: string | null;
    sports: Array<'golf' | 'baseball'>;
  }

  export function classifyAtRisk(
    user: { lastSeen: string | null; createdAt: string | null },
    now: Date,
  ): 'active' | 'at-risk' | 'never-seen' {
    if (!user.lastSeen) {
      const ageDays = user.createdAt
        ? (now.getTime() - new Date(user.createdAt).getTime()) / 86400_000
        : 0;
      return ageDays > 3 ? 'never-seen' : 'active';
    }
    const idleDays = (now.getTime() - new Date(user.lastSeen).getTime()) / 86400_000;
    return idleDays > 14 ? 'at-risk' : 'active';
  }

  /** CALLER must have passed requireSuperAdmin(). */
  export async function fetchUsersTab(filters: { q?: string; role?: string; team?: string }) {
    const admin = createAdminClient();
    const now = new Date();

    let userQuery = admin
      .from('users')
      .select('id, email, role, created_at, last_seen')
      .order('last_seen', { ascending: false, nullsFirst: false })
      .limit(500);
    if (filters.q) userQuery = userQuery.ilike('email', `%${filters.q}%`);
    if (filters.role) userQuery = userQuery.eq('role', filters.role);

    const [usersRes, golfPlayers, golfCoaches, baseballMembers, golfTeams, baseballTeams] =
      await Promise.all([
        userQuery,
        admin.from('golf_players').select('user_id').limit(2000),
        admin.from('golf_coaches').select('user_id').limit(2000),
        admin.from('baseball_team_members').select('user_id').limit(2000),
        admin.from('golf_teams').select('id, name'),
        admin.from('baseball_teams').select('id, name'),
      ]);

    const golfUserIds = new Set(
      [...(golfPlayers.data ?? []), ...(golfCoaches.data ?? [])]
        .map((r) => (r as { user_id: string | null }).user_id)
        .filter(Boolean),
    );
    const baseballUserIds = new Set(
      (baseballMembers.data ?? [])
        .map((r) => (r as { user_id: string | null }).user_id)
        .filter(Boolean),
    );

    const users: DirectoryUser[] = (usersRes.data ?? []).map((u) => {
      const row = u as { id: string; email: string; role: string; created_at: string | null; last_seen: string | null };
      const sports: Array<'golf' | 'baseball'> = [];
      if (golfUserIds.has(row.id)) sports.push('golf');
      if (baseballUserIds.has(row.id)) sports.push('baseball');
      return {
        id: row.id, email: row.email, role: row.role,
        createdAt: row.created_at, lastSeen: row.last_seen, sports,
      };
    });

    // Teams: reuse golf's health model; baseball rows get the same shape.
    // (Golf last-activity detail lives on /admin/golf; this registry favors
    // one homogeneous cross-sport table.)
    const teams = [
      ...(golfTeams.data ?? []).map((t) => ({
        teamId: (t as { id: string }).id,
        name: (t as { name: string }).name,
        playerCount: 0,
        lastActivity: null,
        health: classifyTeamHealth(null, now),
        errors7d: 0,
        sport: 'golf' as const,
      })),
      ...(baseballTeams.data ?? []).map((t) => ({
        teamId: (t as { id: string }).id,
        name: (t as { name: string }).name,
        playerCount: 0,
        lastActivity: null,
        health: classifyTeamHealth(null, now),
        errors7d: 0,
        sport: 'baseball' as const,
      })),
    ] as Array<GolfTeamHealthRow & { sport: 'golf' | 'baseball' }>;

    return {
      users,
      teams,
      atRisk: users.filter((u) => classifyAtRisk({ lastSeen: u.lastSeen, createdAt: u.createdAt }, now) !== 'active'),
    };
  }

  export async function fetchUserDetail(userId: string) {
    const admin = createAdminClient();

    const [userRes, golfMember, baseballMember, rounds, games, lifts, authEvents, errorEvents] =
      await Promise.all([
        admin.from('users').select('id, email, role, created_at, last_seen').eq('id', userId).maybeSingle(),
        admin.from('golf_players').select('id, team_id, golf_teams(name)').eq('user_id', userId),
        admin.from('baseball_team_members').select('team_id, baseball_teams(name)').eq('user_id', userId),
        admin.from('golf_rounds').select('id, created_at, course_name')
          .eq('player_id', userId).order('created_at', { ascending: false }).limit(10),
        admin.from('baseball_games').select('id, created_at')
          .order('created_at', { ascending: false }).limit(5),
        admin.from('helm_lifting_sessions').select('id, created_at')
          .order('created_at', { ascending: false }).limit(5),
        admin.from('admin_events').select('id, title, event_type, created_at')
          .eq('user_id', userId).in('event_type', ['login', 'signup', 'security'])
          .order('created_at', { ascending: false }).limit(25),
        admin.from('admin_events').select('id, title, severity, created_at, fingerprint')
          .eq('user_id', userId).eq('event_type', 'error')
          .order('created_at', { ascending: false }).limit(25),
      ]);

    const u = userRes.data as { id: string; email: string; role: string; created_at: string | null; last_seen: string | null } | null;

    return {
      user: u ? { id: u.id, email: u.email, role: u.role, createdAt: u.created_at, lastSeen: u.last_seen, sports: [] } : null,
      memberships: [
        ...((golfMember.data ?? []) as Array<{ team_id: string | null; golf_teams: { name: string } | null }>)
          .filter((m) => m.team_id)
          .map((m) => ({ sport: 'golf' as const, teamId: m.team_id!, teamName: m.golf_teams?.name ?? 'unknown' })),
        ...((baseballMember.data ?? []) as Array<{ team_id: string | null; baseball_teams: { name: string } | null }>)
          .filter((m) => m.team_id)
          .map((m) => ({ sport: 'baseball' as const, teamId: m.team_id!, teamName: m.baseball_teams?.name ?? 'unknown' })),
      ],
      recentActivity: ((rounds.data ?? []) as Array<{ id: string; created_at: string; course_name: string | null }>).map((r) => ({
        kind: 'round', at: r.created_at, label: r.course_name ?? 'round',
      })),
      authEvents: (authEvents.data ?? []) as Array<{ id: string; title: string; event_type: string; created_at: string }>,
      errorEvents: (errorEvents.data ?? []) as Array<{ id: string; title: string; severity: string; created_at: string; fingerprint: string | null }>,
    };
  }
  ```
  EXECUTOR NOTE: `golf_rounds.player_id` references `golf_players.id`, NOT `users.id` — resolve the player id from the `golf_players` row first and query rounds by that id (adjust the `rounds` query accordingly after reading the generated types). Same check for `baseball_games`/`helm_lifting_sessions` attribution columns. The test-pinned logic is `classifyAtRisk`; the fetch shape may flex to match real FKs.

- [ ] 4. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/data/__tests__/users.test.ts
  npm run typecheck
  ```

- [ ] 5. Commit: `feat(admin): users & teams data layer + at-risk model (W10)`

---

### Task 2 — Impersonation core (signed token + enter/exit actions + banner)

**Files**
- Create: `src/lib/admin/view-as.ts`
- Create: `src/lib/admin/__tests__/view-as.test.ts`
- Create: `src/app/admin/actions/view-as.ts`
- Create: `src/app/admin/_components/ViewAsBanner.tsx`

**Interfaces**
- Produces:
  ```typescript
  // view-as.ts — pure token functions (node:crypto HMAC, no new deps)
  export const VIEW_AS_COOKIE = 'helm_bridge_view_as';
  export const VIEW_AS_TTL_MS = 15 * 60 * 1000;
  export function signViewAsToken(targetUserId: string, expiresAtMs: number, secret: string): string;
  export function verifyViewAsToken(token: string | undefined, secret: string | undefined, now: Date):
    { valid: true; targetUserId: string; expiresAtMs: number } | { valid: false };
  // actions/view-as.ts ('use server')
  export async function enterViewAs(targetUserId: string): Promise<void>;  // audit + cookie + redirect
  export async function exitViewAs(): Promise<void>;                        // audit + clear + redirect
  ```

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/__tests__/view-as.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { signViewAsToken, verifyViewAsToken } from '@/lib/admin/view-as';

  const SECRET = 'test-secret-at-least-32-chars-long!!';
  const now = new Date('2026-07-01T12:00:00Z');
  const future = now.getTime() + 10 * 60_000;

  describe('view-as token', () => {
    it('round-trips a valid token', () => {
      const token = signViewAsToken('user-1', future, SECRET);
      expect(verifyViewAsToken(token, SECRET, now)).toEqual({
        valid: true, targetUserId: 'user-1', expiresAtMs: future,
      });
    });
    it('rejects expiry (time-boxed session is a hard constraint)', () => {
      const token = signViewAsToken('user-1', now.getTime() - 1, SECRET);
      expect(verifyViewAsToken(token, SECRET, now)).toEqual({ valid: false });
    });
    it('rejects tampering with the target user id', () => {
      const token = signViewAsToken('user-1', future, SECRET);
      const forged = token.replace('user-1', 'victim');
      expect(verifyViewAsToken(forged, SECRET, now)).toEqual({ valid: false });
    });
    it('rejects a wrong or missing secret (feature off = fail closed)', () => {
      const token = signViewAsToken('user-1', future, SECRET);
      expect(verifyViewAsToken(token, 'other-secret-also-32-chars-long!!!', now)).toEqual({ valid: false });
      expect(verifyViewAsToken(token, undefined, now)).toEqual({ valid: false });
      expect(verifyViewAsToken(undefined, SECRET, now)).toEqual({ valid: false });
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/view-as.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/view-as.ts`:
  ```typescript
  import { createHmac, timingSafeEqual } from 'node:crypto';

  /**
   * Read-only impersonation token. Format: base64url(userId).expiresMs.hmac
   * HMAC-SHA256 over `${userId}.${expiresMs}` with ADMIN_IMPERSONATION_SECRET.
   * READ-ONLY BY CONSTRUCTION: this cookie only unlocks /admin view-as pages
   * rendered from gated service-role reads — it is never a session for the
   * target user, so writes as them are impossible.
   */

  export const VIEW_AS_COOKIE = 'helm_bridge_view_as';
  export const VIEW_AS_TTL_MS = 15 * 60 * 1000;

  function hmac(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  export function signViewAsToken(
    targetUserId: string,
    expiresAtMs: number,
    secret: string,
  ): string {
    const id = Buffer.from(targetUserId, 'utf8').toString('base64url');
    const payload = `${id}.${expiresAtMs}`;
    return `${payload}.${hmac(payload, secret)}`;
  }

  export function verifyViewAsToken(
    token: string | undefined,
    secret: string | undefined,
    now: Date,
  ): { valid: true; targetUserId: string; expiresAtMs: number } | { valid: false } {
    if (!token || !secret) return { valid: false };
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };
    const [id, expiresRaw, mac] = parts as [string, string, string];
    const expected = hmac(`${id}.${expiresRaw}`, secret);
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false };
    const expiresAtMs = Number(expiresRaw);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) return { valid: false };
    return {
      valid: true,
      targetUserId: Buffer.from(id, 'base64url').toString('utf8'),
      expiresAtMs,
    };
  }
  ```

- [ ] 4. Create `src/app/admin/actions/view-as.ts`:
  ```typescript
  'use server';

  import { cookies } from 'next/headers';
  import { redirect } from 'next/navigation';
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { signViewAsToken, VIEW_AS_COOKIE, VIEW_AS_TTL_MS } from '@/lib/admin/view-as';

  async function writeAudit(action: string, adminUserId: string, targetUserId: string) {
    try {
      const admin = createAdminClient();
      await admin.from('audit_log').insert({
        user_id: adminUserId,
        action,
        table_name: 'users',
        record_id: targetUserId,
        new_data: { target_user: targetUserId, ttl_ms: VIEW_AS_TTL_MS },
      });
    } catch {
      // Auditing is best-effort here; the RPC-side audit patterns cover writes.
    }
  }

  export async function enterViewAs(targetUserId: string): Promise<void> {
    const admin = await requireSuperAdmin();
    const secret = process.env.ADMIN_IMPERSONATION_SECRET;
    if (!secret) throw new Error('View-as not configured (ADMIN_IMPERSONATION_SECRET missing)');

    const expiresAt = Date.now() + VIEW_AS_TTL_MS;
    const cookieStore = await cookies();
    cookieStore.set(VIEW_AS_COOKIE, signViewAsToken(targetUserId, expiresAt, secret), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/admin',
      maxAge: Math.floor(VIEW_AS_TTL_MS / 1000),
    });

    await writeAudit('admin.view_as.enter', admin.userId, targetUserId);
    redirect(`/admin/users/${targetUserId}/view-as`);
  }

  export async function exitViewAs(): Promise<void> {
    const admin = await requireSuperAdmin();
    const cookieStore = await cookies();
    const existing = cookieStore.get(VIEW_AS_COOKIE)?.value ?? '';
    cookieStore.delete(VIEW_AS_COOKIE);
    await writeAudit('admin.view_as.exit', admin.userId, existing.split('.')[0] ?? 'unknown');
    redirect('/admin/users');
  }
  ```

- [ ] 5. Create `src/app/admin/_components/ViewAsBanner.tsx` (persistent, unmissable):
  ```tsx
  import { exitViewAs } from '@/app/admin/actions/view-as';

  export function ViewAsBanner({ email, expiresAtMs }: { email: string; expiresAtMs: number }) {
    return (
      <div
        role="alert"
        className="sticky top-0 z-50 flex items-center justify-between rounded-xl bg-fw-warning px-4 py-2 text-sm font-medium text-warm-950"
      >
        <span>
          VIEWING AS {email} — read-only · expires {new Date(expiresAtMs).toLocaleTimeString()}
        </span>
        <form action={exitViewAs}>
          <button type="submit" className="rounded-lg bg-warm-950 px-3 py-1 text-xs text-white">
            Exit view-as
          </button>
        </form>
      </div>
    );
  }
  ```

- [ ] 6. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/__tests__/view-as.test.ts
  npm run typecheck
  ```
  Expected: 5 tests pass.

- [ ] 7. Commit: `feat(admin): read-only view-as core — signed TTL token, audit, banner (W10)`

---

### Task 3 — Pages: directory, user detail, view-as

**Files**
- Create: `src/app/admin/users/page.tsx`
- Create: `src/app/admin/users/[id]/page.tsx`
- Create: `src/app/admin/users/[id]/view-as/page.tsx`

**Steps**

- [ ] 1. Create `src/app/admin/users/page.tsx`:
  ```tsx
  import Link from 'next/link';
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { fetchUsersTab } from '@/lib/admin/data/users';
  import { PanelBoundary } from '../_components/PanelBoundary';
  import { SportBadge } from '../_components/SportBadge';
  import { TeamHealthTable } from '../_components/TeamHealthTable';
  import { AutoRefresh } from '../_components/AutoRefresh';

  export const dynamic = 'force-dynamic';

  export default async function UsersPage({
    searchParams,
  }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    await requireSuperAdmin();
    const params = await searchParams;
    const q = typeof params.q === 'string' ? params.q : undefined;
    const role = typeof params.role === 'string' ? params.role : undefined;
    const team = typeof params.team === 'string' ? params.team : undefined;

    async function Body() {
      const tab = await fetchUsersTab({ q, role, team });
      return (
        <div className="space-y-6">
          <form method="get" className="flex gap-2">
            <input
              type="search" name="q" defaultValue={q ?? ''} placeholder="Search email…"
              className="rounded-lg border border-warm-300 px-3 py-1.5 text-sm"
            />
            <button type="submit" className="rounded-lg bg-warm-900 px-3 py-1.5 text-sm text-white">Search</button>
          </form>

          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
              Users ({tab.users.length})
            </h2>
            <ul className="divide-y divide-warm-200/60">
              {tab.users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link href={`/admin/users/${u.id}`} className="min-w-0 flex-1 truncate font-medium text-warm-900 hover:underline">
                    {u.email}
                  </Link>
                  <span className="text-xs uppercase text-warm-500">{u.role}</span>
                  {u.sports.map((s) => <SportBadge key={s} sport={s} />)}
                  <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                    {u.lastSeen ? `seen ${new Date(u.lastSeen).toLocaleDateString()}` : 'never seen'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Teams</h2>
            <TeamHealthTable teams={tab.teams.map((t) => ({ ...t, href: `/admin/users?team=${t.teamId}` }))} />
          </section>

          <section className="rounded-2xl border border-fw-warning/40 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
              At-risk accounts ({tab.atRisk.length})
            </h2>
            <ul className="divide-y divide-warm-200/60">
              {tab.atRisk.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{u.email}</span>
                  {/* CRM boundary: link OUT only — zero email capability here. */}
                  <a href="/golf/admin/crm" className="text-xs text-accent-700 underline">Open in CRM →</a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      );
    }

    return (
      <main className="space-y-6 p-6">
        <AutoRefresh intervalMs={60_000} />
        <PanelBoundary title="Users & Teams"><Body /></PanelBoundary>
      </main>
    );
  }
  ```

- [ ] 2. Create `src/app/admin/users/[id]/page.tsx`:
  ```tsx
  import Link from 'next/link';
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { fetchUserDetail } from '@/lib/admin/data/users';
  import { fetchActiveSessions } from '@/lib/admin/data/auth';
  import { SessionsPanel } from '../../_components/SessionsPanel';
  import { PanelBoundary } from '../../_components/PanelBoundary';
  import { SportBadge } from '../../_components/SportBadge';
  import { enterViewAs } from '../../actions/view-as';

  export const dynamic = 'force-dynamic';

  export default async function UserDetailPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    await requireSuperAdmin();
    const { id } = await params;

    async function Body() {
      const detail = await fetchUserDetail(id);
      if (!detail.user) return <p className="text-sm text-warm-500">User not found.</p>;
      const sessions = (await fetchActiveSessions()).filter((s) => s.user_id === id);
      const enterViewAsForUser = enterViewAs.bind(null, id);

      return (
        <div className="space-y-6">
          <header className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold text-warm-900">{detail.user.email}</h1>
              <p className="font-fw-mono text-xs tabular-nums text-warm-500">
                {detail.user.role} · joined {detail.user.createdAt ? new Date(detail.user.createdAt).toLocaleDateString() : '—'} ·
                last seen {detail.user.lastSeen ? new Date(detail.user.lastSeen).toLocaleString() : 'never'}
              </p>
            </div>
            <form action={enterViewAsForUser}>
              <button type="submit" className="rounded-lg border border-fw-warning px-3 py-1.5 text-sm text-warm-800">
                View as (read-only, 15 min)
              </button>
            </form>
          </header>

          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Memberships</h2>
            <ul className="space-y-1">
              {detail.memberships.map((m) => (
                <li key={`${m.sport}:${m.teamId}`} className="flex items-center gap-2 text-sm">
                  <SportBadge sport={m.sport} /> {m.teamName}
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Recent auth events</h2>
              <ul className="divide-y divide-warm-200/60">
                {detail.authEvents.map((e) => (
                  <li key={e.id} className="py-1.5 text-sm">
                    {e.title}
                    <span className="ml-2 font-fw-mono text-xs text-warm-500">{new Date(e.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Error events</h2>
              <ul className="divide-y divide-warm-200/60">
                {detail.errorEvents.map((e) => (
                  <li key={e.id} className="py-1.5 text-sm">
                    {e.fingerprint ? (
                      <Link href={`/admin/errors/${e.fingerprint}`} className="hover:underline">{e.title}</Link>
                    ) : e.title}
                    <span className="ml-2 font-fw-mono text-xs text-warm-500">{e.severity}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Active sessions</h2>
            <SessionsPanel sessions={sessions} />
          </section>
        </div>
      );
    }

    return (
      <main className="space-y-6 p-6">
        <PanelBoundary title="User detail"><Body /></PanelBoundary>
      </main>
    );
  }
  ```

- [ ] 3. Create `src/app/admin/users/[id]/view-as/page.tsx`:
  ```tsx
  import { cookies } from 'next/headers';
  import { redirect } from 'next/navigation';
  import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
  import { verifyViewAsToken, VIEW_AS_COOKIE } from '@/lib/admin/view-as';
  import { fetchUserDetail } from '@/lib/admin/data/users';
  import { ViewAsBanner } from '../../../_components/ViewAsBanner';
  import { SportBadge } from '../../../_components/SportBadge';

  export const dynamic = 'force-dynamic';

  /**
   * READ-ONLY impersonation surface. Requires BOTH the super-admin gate AND a
   * live signed token for THIS user id. Renders the user's world from gated
   * service-role reads — zero mutation affordances exist on this page, and no
   * session for the target user is ever created.
   */
  export default async function ViewAsPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    await requireSuperAdmin();
    const { id } = await params;

    const cookieStore = await cookies();
    const token = verifyViewAsToken(
      cookieStore.get(VIEW_AS_COOKIE)?.value,
      process.env.ADMIN_IMPERSONATION_SECRET,
      new Date(),
    );
    if (!token.valid || token.targetUserId !== id) {
      redirect(`/admin/users/${id}`); // expired or mismatched — re-enter explicitly
    }

    const detail = await fetchUserDetail(id);
    if (!detail.user) redirect('/admin/users');

    return (
      <main className="space-y-4 p-6">
        <ViewAsBanner email={detail.user.email} expiresAtMs={token.expiresAtMs} />
        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Their teams</h2>
          <ul className="space-y-1">
            {detail.memberships.map((m) => (
              <li key={`${m.sport}:${m.teamId}`} className="flex items-center gap-2 text-sm">
                <SportBadge sport={m.sport} /> {m.teamName}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Their recent activity</h2>
          <ul className="divide-y divide-warm-200/60">
            {detail.recentActivity.map((a, i) => (
              <li key={i} className="py-1.5 text-sm">
                {a.label}
                <span className="ml-2 font-fw-mono text-xs text-warm-500">{new Date(a.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    );
  }
  ```

- [ ] 4. Gates + smoke:
  ```bash
  npm run test:run -- src/app/admin/__tests__/admin-gate-coverage.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```
  Manual: enter view-as on the demo player → banner + read-only data; `audit_log` gains `admin.view_as.enter`; wait past TTL (or delete the cookie) → redirect back to detail; exit writes `admin.view_as.exit`.

- [ ] 5. Commit: `feat(admin): users & teams tab, user drill-down, read-only view-as (W10)`

---

## Acceptance Criteria

- [ ] Directory searches by email, shows sport badges + last-seen; NO email actions anywhere (grep the new pages for `BulkEmailModal|crm_` → zero hits except the literal `/golf/admin/crm` href strings).
- [ ] Per-user drill-down shows memberships, auth history, error events (linking to fingerprint pages), and that user's sessions with working revoke.
- [ ] View-as: enter/exit both write `audit_log` rows; banner is persistent; token expires at 15 min (test-pinned); tampered/foreign tokens rejected (test-pinned); missing `ADMIN_IMPERSONATION_SECRET` = feature off, enter throws a clear error.
- [ ] The view-as page contains zero forms/buttons other than "Exit view-as" (read-only by construction).
- [ ] All gates green; 8 new tests pass.

## Rollback

`git revert` — directory, drill-down, and view-as all disappear; the cookie (if set) is orphaned and ignored. No DB changes.
