# W4: Design Foundation — Ops Chrome, Sport Inks, Panel Pattern

**Goal:** Build the reusable presentation layer every tab composes: the Fairway `AppShell` ops chrome wired into `/admin`, the NEW baseball clay ink token (the `.living-annual` scope from the design DOES NOT EXIST — reground §2.3), the dark status banner, KPI tile, and the Suspense/STALE/error-boundary panel pattern.

**Depends-on:** W1 (`/admin` layout exists).

**PR-scope:** ONE PR — tokens + `_components/*` + layout wiring. Presentational only; panels get real data in W5+.

**Verified primitives consumed (all exported from `src/components/fairway/index.ts`):** `AppShell` (`sections: readonly NavSection[]`, `pathname`, `linkComponent`, `brand`, `onSearchOpen`, `topBarActions` — `app-shell/AppShell.tsx:36-81`), `NavItem` (`label/href/icon: FairwayIcon` — `app-shell/types.ts:19-29`), `StatTile` (`label/value/format/trendData/goodDirection/delta/starved` — `charts/StatTile.tsx:36-71`), `StatusPill` (`tone: FwStatusTone; dot; pulse` — `controls/status-pill.tsx:21-29`), `CommandMenu`, `Skeleton`/`SkeletonStat`, `InlineNotice`. `FairwayIcon = ComponentType<{ size?: number; className?: string } & SVGAttributes<SVGElement>>` — lucide-react icons satisfy it.

---

### Task 1 — Baseball clay ink token + `SportBadge`

**Files**
- Modify: `src/styles/design-tokens.css` (additive `:root` var)
- Modify: `tailwind.config.ts` (one color entry beside the `fw-*` trio at lines 66-71)
- Create: `src/app/admin/_components/SportBadge.tsx`
- Create: `src/app/admin/_components/__tests__/sport-badge.test.tsx`

**Interfaces**
- Produces:
  ```typescript
  export type BridgeSport = 'golf' | 'baseball' | 'shared';
  export function SportBadge({ sport }: { sport: BridgeSport | null }): JSX.Element | null;
  ```
- CSS: `--fw-color-team-baseball: #C2703D;` → Tailwind `team-baseball`.

**Steps**

- [ ] 1. Write the failing test `src/app/admin/_components/__tests__/sport-badge.test.tsx`:
  ```tsx
  import { describe, it, expect } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { SportBadge } from '@/app/admin/_components/SportBadge';

  describe('SportBadge', () => {
    it('labels golf with the green ink', () => {
      render(<SportBadge sport="golf" />);
      const badge = screen.getByText('Golf');
      expect(badge.className).toContain('text-accent-700');
    });
    it('labels baseball with the clay ink', () => {
      render(<SportBadge sport="baseball" />);
      const badge = screen.getByText('Baseball');
      expect(badge.className).toContain('text-team-baseball');
    });
    it('renders nothing for null (no fake attribution)', () => {
      const { container } = render(<SportBadge sport={null} />);
      expect(container.firstChild).toBeNull();
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/app/admin/_components/__tests__/sport-badge.test.tsx
  ```
  Expected: FAIL — module not found.

- [ ] 3. `src/styles/design-tokens.css` — inside the existing `:root` block, after the `--fw-color-nav-bg` line (~105), add:
  ```css
    /* ── Helm Bridge sport inks ──────────────────────────────────────────
       Baseball wayfinding accent (infield clay). NOTE: the "Living Annual"
       .living-annual self-skinning scope described in older planning docs
       was never shipped — this token IS the baseball ink layer. Never blend
       it with the golf accent on one surface. */
    --fw-color-team-baseball: #C2703D;
  ```

- [ ] 4. `tailwind.config.ts` — in the same `colors` object as `'fw-danger'` (after line 71), add:
  ```typescript
        'team-baseball':  'var(--fw-color-team-baseball)',
  ```
  (Tailwind here is v3.4 — plain config extension only, NO v4 `@theme` syntax.)

- [ ] 5. Create `src/app/admin/_components/SportBadge.tsx`:
  ```tsx
  import { cn } from '@/lib/utils';

  export type BridgeSport = 'golf' | 'baseball' | 'shared';

  const STYLES: Record<BridgeSport, { label: string; className: string }> = {
    golf: { label: 'Golf', className: 'text-accent-700 border-accent-200 bg-accent-50' },
    baseball: { label: 'Baseball', className: 'text-team-baseball border-team-baseball/30 bg-team-baseball/10' },
    shared: { label: 'Shared', className: 'text-warm-600 border-warm-300 bg-warm-100' },
  };

  /** Sport wayfinding ink — text + border, never color alone. Null → nothing
   *  (an event with no sport attribution renders unbadged, not mislabeled). */
  export function SportBadge({ sport }: { sport: BridgeSport | null }) {
    if (!sport) return null;
    const s = STYLES[sport];
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
          s.className,
        )}
      >
        {s.label}
      </span>
    );
  }
  ```

- [ ] 6. Run to confirm pass:
  ```bash
  npm run test:run -- src/app/admin/_components/__tests__/sport-badge.test.tsx
  ```
  Expected: 3 tests pass.

- [ ] 7. Commit: `feat(admin): baseball clay ink token + SportBadge (W4)`

---

### Task 2 — `AdminShell`: Fairway ops chrome + ⌘K + keyboard shortcuts

**Files**
- Create: `src/app/admin/_components/AdminShell.tsx`
- Create: `src/app/admin/_components/admin-nav.ts`
- Create: `src/app/admin/_components/__tests__/admin-nav.test.ts`
- Modify: `src/app/admin/layout.tsx` (mount the shell inside the existing gate)

**Interfaces**
- Produces:
  ```typescript
  // admin-nav.ts — pure, shared with CommandMenu + shortcut handler
  export interface AdminNavEntry { label: string; href: string; key: string; } // key = '1'..'8'
  export const ADMIN_NAV: readonly AdminNavEntry[];
  export function hrefForShortcut(key: string): string | null;
  ```
  ```tsx
  export function AdminShell({ email, children }: { email: string; children: React.ReactNode }): JSX.Element;
  ```

**Steps**

- [ ] 1. Write the failing test `src/app/admin/_components/__tests__/admin-nav.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { ADMIN_NAV, hrefForShortcut } from '@/app/admin/_components/admin-nav';

  describe('ADMIN_NAV', () => {
    it('declares exactly the 8 tabs in canonical order', () => {
      expect(ADMIN_NAV.map((e) => e.href)).toEqual([
        '/admin',
        '/admin/errors',
        '/admin/auth',
        '/admin/golf',
        '/admin/baseball',
        '/admin/users',
        '/admin/jobs',
        '/admin/deploys',
      ]);
      expect(ADMIN_NAV.map((e) => e.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    });
    it('maps shortcut keys to hrefs and rejects unknowns', () => {
      expect(hrefForShortcut('2')).toBe('/admin/errors');
      expect(hrefForShortcut('9')).toBeNull();
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/app/admin/_components/__tests__/admin-nav.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Create `src/app/admin/_components/admin-nav.ts`:
  ```typescript
  export interface AdminNavEntry {
    label: string;
    href: string;
    key: string;
  }

  /** The 8 tabs. Order is the keyboard map (1-8). */
  export const ADMIN_NAV: readonly AdminNavEntry[] = [
    { label: 'Overview', href: '/admin', key: '1' },
    { label: 'Errors', href: '/admin/errors', key: '2' },
    { label: 'Auth & Sign-ins', href: '/admin/auth', key: '3' },
    { label: 'Golf', href: '/admin/golf', key: '4' },
    { label: 'Baseball', href: '/admin/baseball', key: '5' },
    { label: 'Users & Teams', href: '/admin/users', key: '6' },
    { label: 'Jobs & Integrity', href: '/admin/jobs', key: '7' },
    { label: 'Deploys & Infra', href: '/admin/deploys', key: '8' },
  ] as const;

  export function hrefForShortcut(key: string): string | null {
    return ADMIN_NAV.find((e) => e.key === key)?.href ?? null;
  }
  ```

- [ ] 4. Create `src/app/admin/_components/AdminShell.tsx`:
  ```tsx
  'use client';

  import { useEffect, useMemo, useState } from 'react';
  import Link from 'next/link';
  import { usePathname, useRouter } from 'next/navigation';
  import {
    LayoutDashboard, AlertTriangle, KeyRound, Flag, CircleDot,
    Users, Timer, Rocket, ExternalLink,
  } from 'lucide-react';
  import { AppShell, CommandMenu, type NavSection, type CommandGroup } from '@/components/fairway';
  import { ADMIN_NAV, hrefForShortcut } from './admin-nav';

  const NAV_ICONS = [
    LayoutDashboard, AlertTriangle, KeyRound, Flag, CircleDot, Users, Timer, Rocket,
  ] as const;

  /**
   * Helm Bridge chrome: Fairway AppShell (warm-black rail + cream canvas) as
   * the neutral ops shell. Sport inks appear ONLY inside sport-scoped panes.
   * Keyboard: 1-8 jump tabs, R refreshes, ⌘K opens the command menu —
   * preserving the old admin's muscle memory.
   */
  export function AdminShell({
    email,
    children,
  }: {
    email: string;
    children: React.ReactNode;
  }) {
    const pathname = usePathname();
    const router = useRouter();
    const [commandOpen, setCommandOpen] = useState(false);

    const sections: readonly NavSection[] = useMemo(
      () => [
        {
          heading: 'Bridge',
          items: ADMIN_NAV.map((entry, i) => ({
            label: entry.label,
            href: entry.href,
            icon: NAV_ICONS[i]!,
            // Overview must not stay lit on every /admin/* subroute.
            isActive: (p: string) =>
              entry.href === '/admin' ? p === '/admin' : p.startsWith(entry.href),
          })),
        },
        {
          heading: 'Elsewhere',
          items: [
            // CRM stays a plain LINK OUT — no CRM code crosses the boundary.
            { label: 'Coach CRM', href: '/golf/admin/crm', icon: ExternalLink },
          ],
        },
      ],
      [],
    );

    useEffect(() => {
      function onKeyDown(e: KeyboardEvent) {
        const target = e.target as HTMLElement | null;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          router.refresh();
          return;
        }
        const href = hrefForShortcut(e.key);
        if (href) {
          e.preventDefault();
          router.push(href);
        }
      }
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [router]);

    const commandGroups: readonly CommandGroup[] = useMemo(
      () => [
        {
          heading: 'Tabs',
          items: ADMIN_NAV.map((entry) => ({
            id: entry.href,
            label: entry.label,
            hint: entry.key,
            onSelect: () => {
              setCommandOpen(false);
              router.push(entry.href);
            },
          })),
        },
      ],
      [router],
    );

    return (
      <div className="fairway-ds min-h-screen bg-canvas-gradient">
        <AppShell
          sections={sections}
          brand={
            <span className="text-sm font-semibold tracking-wide text-white">
              Helm <span className="text-accent-400">Bridge</span>
            </span>
          }
          user={{ name: 'Super admin', teamName: email }}
          pathname={pathname}
          linkComponent={Link}
          onSearchOpen={() => setCommandOpen(true)}
          searchPlaceholder="Jump to tab, user, team…"
        >
          {children}
        </AppShell>
        <CommandMenu
          open={commandOpen}
          onOpenChange={setCommandOpen}
          groups={commandGroups}
          placeholder="Jump to…"
        />
      </div>
    );
  }
  ```
  NOTE for the executor: before wiring, read `src/components/fairway/command/command-menu.tsx` for the exact `CommandMenuProps`/`CommandGroup` field names (`open/onOpenChange/groups` assumed here from the barrel exports) and adjust this call site — do NOT modify the kit. If `CommandGroup` items use different keys (e.g. `value`/`onSelect`), conform to the kit. Same for `NavItem.isActive` — if the predicate prop is named differently (`activeWhen`), conform. The `admin-nav.ts` contract is what other waves import; the shell internals may flex.

- [ ] 5. Rewire `src/app/admin/layout.tsx` to mount the shell (gate stays first-line, unchanged):
  ```tsx
  import { redirect } from 'next/navigation';
  import { checkSuperAdminAccess } from '@/lib/admin/require-super-admin';
  import { AdminNativeGuard } from '@/components/golf/AdminNativeGuard';
  import { AdminMotionProvider } from './_motion-provider';
  import { AdminShell } from './_components/AdminShell';

  export const dynamic = 'force-dynamic';

  export default async function AdminLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    const probe = await checkSuperAdminAccess();
    if (!probe.allowed) {
      redirect(probe.reason === 'unauthenticated' ? '/golf/login' : '/golf/dashboard');
    }

    return (
      <AdminMotionProvider>
        <AdminNativeGuard />
        <AdminShell email={probe.context.email}>{children}</AdminShell>
      </AdminMotionProvider>
    );
  }
  ```

- [ ] 6. Run to confirm pass + gates:
  ```bash
  npm run test:run -- src/app/admin/_components/__tests__/admin-nav.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```
  Manual smoke: `npm run dev` → `/admin` shows the warm-black rail with 8 entries + "Coach CRM" link; keys 2/5 navigate; ⌘K opens.

- [ ] 7. Commit: `feat(admin): AdminShell ops chrome with 8-tab nav, shortcuts, command menu (W4)`

---

### Task 3 — `AdminStatusBanner` + `KpiTile`

**Files**
- Create: `src/app/admin/_components/AdminStatusBanner.tsx`
- Create: `src/app/admin/_components/KpiTile.tsx`
- Create: `src/app/admin/_components/__tests__/admin-status-banner.test.tsx`

**Interfaces**
- Produces (presentational — W5 feeds them):
  ```typescript
  export type BannerState = 'nominal' | 'attention' | 'critical' | 'stale';
  export function AdminStatusBanner(props: {
    state: BannerState;
    attentionCount: number;
    checkedAt: string; // ISO
  }): JSX.Element;

  export function KpiTile(props: {
    label: string;
    value: number | null;          // null → honest starved state, never a fake 0
    href: string;                  // every Level-1 number deep-links
    format?: Intl.NumberFormatOptions;
    trendData?: readonly number[];
    delta?: number;
    goodDirection?: 'up' | 'down';
    tone?: 'neutral' | 'danger' | 'warning';
  }): JSX.Element;
  ```

**Steps**

- [ ] 1. Write the failing test `src/app/admin/_components/__tests__/admin-status-banner.test.tsx`:
  ```tsx
  import { describe, it, expect } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { AdminStatusBanner } from '@/app/admin/_components/AdminStatusBanner';

  describe('AdminStatusBanner', () => {
    it('renders the all-clear line with a timestamp', () => {
      render(<AdminStatusBanner state="nominal" attentionCount={0} checkedAt="2026-07-01T12:00:00Z" />);
      expect(screen.getByText(/All systems nominal/i)).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    it('renders the attention count when red', () => {
      render(<AdminStatusBanner state="critical" attentionCount={3} checkedAt="2026-07-01T12:00:00Z" />);
      expect(screen.getByText(/3 items need attention/i)).toBeInTheDocument();
    });
    it('renders an explicit STALE state distinct from healthy-quiet', () => {
      render(<AdminStatusBanner state="stale" attentionCount={0} checkedAt="2026-07-01T12:00:00Z" />);
      expect(screen.getByText(/status feed stale/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/app/admin/_components/__tests__/admin-status-banner.test.tsx
  ```
  Expected: FAIL — module not found.

- [ ] 3. Create `src/app/admin/_components/AdminStatusBanner.tsx` — the ONE sanctioned on-dark surface (`--fw-color-nav-bg` = warm-950), instantly signaling "admin mode" against the shared prod DB:
  ```tsx
  import { CheckCircle2, AlertTriangle, AlertOctagon, CloudOff } from 'lucide-react';
  import { cn } from '@/lib/utils';

  export type BannerState = 'nominal' | 'attention' | 'critical' | 'stale';

  const STATES: Record<BannerState, { icon: typeof CheckCircle2; dot: string; label: (n: number) => string }> = {
    nominal: { icon: CheckCircle2, dot: 'bg-fw-success', label: () => 'All systems nominal' },
    attention: { icon: AlertTriangle, dot: 'bg-fw-warning', label: (n) => `${n} item${n === 1 ? '' : 's'} need attention` },
    critical: { icon: AlertOctagon, dot: 'bg-fw-danger', label: (n) => `${n} item${n === 1 ? '' : 's'} need attention` },
    stale: { icon: CloudOff, dot: 'bg-fw-warning', label: () => 'Status feed stale — showing last known state' },
  };

  /** Severity is icon + label + dot — never color alone. */
  export function AdminStatusBanner({
    state,
    attentionCount,
    checkedAt,
  }: {
    state: BannerState;
    attentionCount: number;
    checkedAt: string;
  }) {
    const s = STATES[state];
    const Icon = s.icon;
    return (
      <div
        role="status"
        className="flex items-center justify-between rounded-2xl bg-[var(--fw-color-nav-bg)] px-5 py-3 text-white"
      >
        <div className="flex items-center gap-3">
          <span className={cn('h-2.5 w-2.5 rounded-full', s.dot)} aria-hidden />
          <Icon size={16} aria-hidden />
          <span className="text-sm font-medium">{s.label(attentionCount)}</span>
        </div>
        <span className="font-fw-mono text-xs tabular-nums text-white/60">
          checked {new Date(checkedAt).toLocaleTimeString()}
        </span>
      </div>
    );
  }
  ```

- [ ] 4. Create `src/app/admin/_components/KpiTile.tsx` (wraps the verified `StatTile` contract; the whole tile is a deep link):
  ```tsx
  import Link from 'next/link';
  import { StatTile } from '@/components/fairway';
  import { cn } from '@/lib/utils';

  export function KpiTile({
    label,
    value,
    href,
    format,
    trendData,
    delta,
    goodDirection = 'up',
    tone = 'neutral',
  }: {
    label: string;
    value: number | null;
    href: string;
    format?: Intl.NumberFormatOptions;
    trendData?: readonly number[];
    delta?: number;
    goodDirection?: 'up' | 'down';
    tone?: 'neutral' | 'danger' | 'warning';
  }) {
    return (
      <Link
        href={href}
        className={cn(
          'block rounded-2xl transition-shadow hover:shadow-card-hover focus-visible:outline-2',
          tone === 'danger' && 'ring-1 ring-fw-danger/40',
          tone === 'warning' && 'ring-1 ring-fw-warning/40',
        )}
      >
        <StatTile
          label={label}
          value={value ?? undefined}
          starved={value === null}
          format={format}
          trendData={trendData}
          delta={delta}
          goodDirection={goodDirection}
          mono
        />
      </Link>
    );
  }
  ```

- [ ] 5. Run to confirm pass:
  ```bash
  npm run test:run -- src/app/admin/_components/__tests__/admin-status-banner.test.tsx
  npm run typecheck
  ```
  Expected: 3 tests pass; tsc green (StatTile props conform to `charts/StatTile.tsx:36-71`).

- [ ] 6. Commit: `feat(admin): status banner + KPI tile primitives (W4)`

---

### Task 4 — `PanelBoundary`: Suspense + error boundary + STALE + freshness

**Files**
- Create: `src/app/admin/_components/PanelBoundary.tsx`
- Create: `src/app/admin/_components/PanelStates.tsx`
- Create: `src/app/admin/_components/__tests__/panel-boundary.test.tsx`

**Interfaces**
- Produces (every W5–W13 panel wraps in this):
  ```tsx
  export function PanelBoundary(props: {
    title: string;
    skeleton?: React.ReactNode;   // layout-matching skeleton, default SkeletonStat
    children: React.ReactNode;    // an async server component
  }): JSX.Element;

  // PanelStates.tsx — the three honest states (all-clear / no-data / stale)
  export function PanelAllClear({ label, checkedAt }: { label: string; checkedAt: string }): JSX.Element;
  export function PanelNoData({ label, description }: { label: string; description: string }): JSX.Element;
  export function PanelStale({ label, error }: { label: string; error?: string }): JSX.Element;
  ```

**Steps**

- [ ] 1. Write the failing test `src/app/admin/_components/__tests__/panel-boundary.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { PanelBoundary } from '@/app/admin/_components/PanelBoundary';
  import { PanelAllClear, PanelNoData, PanelStale } from '@/app/admin/_components/PanelStates';

  function Bomb(): JSX.Element {
    throw new Error('panel exploded');
  }

  describe('PanelBoundary', () => {
    it('contains a child crash to an amber stale card — never blanks the console', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <PanelBoundary title="Errors">
          <Bomb />
        </PanelBoundary>,
      );
      expect(screen.getByText(/Errors/)).toBeInTheDocument();
      expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
      spy.mockRestore();
    });
    it('renders healthy children untouched', () => {
      render(
        <PanelBoundary title="Errors">
          <p>healthy content</p>
        </PanelBoundary>,
      );
      expect(screen.getByText('healthy content')).toBeInTheDocument();
    });
  });

  describe('panel states are visually distinct', () => {
    it('all-clear is celebratory + timestamped', () => {
      render(<PanelAllClear label="No errors in the last 24h" checkedAt="2026-07-01T12:00:00Z" />);
      expect(screen.getByText(/No errors in the last 24h/)).toBeInTheDocument();
      expect(screen.getByText(/checked/)).toBeInTheDocument();
    });
    it('no-data explains what WOULD appear', () => {
      render(<PanelNoData label="No data yet" description="Pitch-level rows appear here once ingestion starts" />);
      expect(screen.getByText(/once ingestion starts/)).toBeInTheDocument();
    });
    it('stale carries the upstream error', () => {
      render(<PanelStale label="Sentry" error="429" />);
      expect(screen.getByText(/last known data/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/app/admin/_components/__tests__/panel-boundary.test.tsx
  ```
  Expected: FAIL — modules not found.

- [ ] 3. Create `src/app/admin/_components/PanelStates.tsx`:
  ```tsx
  import { CheckCircle2, Inbox, CloudOff } from 'lucide-react';

  /** All-clear ≠ no-data ≠ fetch-failed. Three distinct states so a silent
   *  dashboard is never mistaken for a healthy system. */

  export function PanelAllClear({ label, checkedAt }: { label: string; checkedAt: string }) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-fw-success-bg px-6 py-8 text-center">
        <CheckCircle2 size={20} className="text-fw-success" aria-hidden />
        <p className="text-sm font-medium text-accent-700">{label}</p>
        <p className="font-fw-mono text-xs tabular-nums text-warm-500">
          checked {new Date(checkedAt).toLocaleTimeString()}
        </p>
      </div>
    );
  }

  export function PanelNoData({ label, description }: { label: string; description: string }) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-sunken px-6 py-8 text-center">
        <Inbox size={20} className="text-warm-400" aria-hidden />
        <p className="text-sm font-medium text-warm-700">{label}</p>
        <p className="text-xs text-warm-500">{description}</p>
      </div>
    );
  }

  export function PanelStale({ label, error }: { label: string; error?: string }) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-fw-warning-bg px-6 py-8 text-center">
        <CloudOff size={20} className="text-fw-warning" aria-hidden />
        <p className="text-sm font-medium text-warm-800">{label} — showing last known data</p>
        {error ? <p className="font-fw-mono text-xs text-warm-600">{error}</p> : null}
      </div>
    );
  }
  ```
  (If `bg-surface-sunken` is not a configured Tailwind color in this repo, use `bg-warm-100` — check `tailwind.config.ts` before committing.)

- [ ] 4. Create `src/app/admin/_components/PanelBoundary.tsx`:
  ```tsx
  'use client';

  import { Component, Suspense, type ReactNode } from 'react';
  import { SkeletonStat } from '@/components/fairway';
  import { PanelStale } from './PanelStates';

  /**
   * Per-panel resilience: one upstream hiccup (Sentry 429, RPC timeout) must
   * never blank the console — the monitor must be more reliable than the
   * monitored. Suspense shows a layout-matching skeleton; the error boundary
   * degrades to an amber STALE card scoped to THIS panel only.
   */

  class PanelErrorBoundary extends Component<
    { title: string; children: ReactNode },
    { error: Error | null }
  > {
    state = { error: null as Error | null };

    static getDerivedStateFromError(error: Error) {
      return { error };
    }

    render() {
      if (this.state.error) {
        return (
          <section aria-label={this.props.title}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
              {this.props.title}
            </h2>
            <PanelStale
              label={`${this.props.title} temporarily unavailable`}
              error={this.state.error.message}
            />
          </section>
        );
      }
      return this.props.children;
    }
  }

  export function PanelBoundary({
    title,
    skeleton,
    children,
  }: {
    title: string;
    skeleton?: ReactNode;
    children: ReactNode;
  }) {
    return (
      <PanelErrorBoundary title={title}>
        <Suspense fallback={skeleton ?? <SkeletonStat />}>{children}</Suspense>
      </PanelErrorBoundary>
    );
  }
  ```

- [ ] 5. Run to confirm pass + full gates:
  ```bash
  npm run test:run -- src/app/admin/_components/__tests__/panel-boundary.test.tsx
  npm run typecheck && npm run lint && npm run test:run
  ```
  Expected: 5 tests pass; gates green.

- [ ] 6. Commit: `feat(admin): PanelBoundary + honest tri-state panel states (W4)`

---

## Acceptance Criteria

- [ ] `--fw-color-team-baseball` exists in `design-tokens.css`; `team-baseball` resolves in Tailwind; SportBadge renders green/clay/neutral correctly.
- [ ] `/admin` renders inside the Fairway warm-black rail with 8 tabs + "Coach CRM →" link; keys 1–8 navigate; R refreshes; ⌘K opens the command menu.
- [ ] Status banner renders 4 distinct states (nominal/attention/critical/stale), each icon+label+dot — never color alone.
- [ ] `PanelBoundary` contains a thrown child to a per-panel STALE card (test-pinned) — the shell and sibling panels survive.
- [ ] KpiTile renders `starved` honesty state for `value === null` (never a fabricated 0).
- [ ] `npm run typecheck && npm run lint && npm run test:run` green; no modifications to any file under `src/components/fairway/` (compose, never fork the kit).

## Rollback

`git revert` the W4 PR: `/admin` falls back to the W1 placeholder; the two token additions (CSS var + Tailwind color) are inert if left behind.
