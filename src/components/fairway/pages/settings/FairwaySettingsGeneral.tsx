'use client';

/**
 * ============================================================================
 * Fairway · Settings · FairwaySettingsGeneral  (COACH + PLAYER · ADDITIVE · GATED)
 * ----------------------------------------------------------------------------
 * Flag-on redesign of the main /golf/dashboard/settings screen (the legacy
 * default-export client page `GolfSettingsPage`). PRESENTATION-ONLY.
 *
 * There is NO server loader for this route — the legacy page fetches everything
 * client-side from the `useGolfUser()` context + the supabase client. This
 * component reuses the SAME plumbing VERBATIM (same context, same supabase
 * client, same `.update()/.upsert()` mutations — never delete-then-insert, same
 * shared widgets and hooks):
 *
 *   • useGolfUser()                       — '@/contexts/golf-user-context'
 *   • useAppearancePreferences()          — '@/hooks/golf/use-appearance-preferences'
 *   • fromUntyped                         — '@/lib/supabase/untyped'
 *     (team panels bind to useGolfUser().teamId — the cookie-aware ACTIVE team)
 *   • BENCHMARK_* (sg benchmark)          — '@/lib/golf/sg-benchmarks'
 *   • AvatarUpload / ConfirmDialog        — '@/components/ui/*'
 *   • JoinTeamSection / CoachHelmToggle   — '@/components/golf/*'
 *   • account delete  → DELETE /api/account/delete   (identical to legacy)
 *
 * Honest empties: unset fields render as empty inputs / em-dash, never faked.
 * Toasts via `fairwayToast`. Tokens / primitives ONLY for chrome — no legacy
 * warm or primary classes, no glass on content.
 * ========================================================================== */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field } from '@base-ui-components/react/field';

import { createClient } from '@/lib/supabase/client';
import { logError } from '@/lib/error-logging';
import { clearActiveTeam } from '@/app/golf/actions/team-switcher';
import { regenerateJoinCode } from '@/app/golf/actions/teams';
import { fromUntyped } from '@/lib/supabase/untyped';
import { cn } from '@/lib/utils';
import { useGolfUser } from '@/contexts/golf-user-context';
import { triggerHaptic, isNativeApp } from '@/lib/utils/capacitor';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import type { DistancePreference } from '@/lib/golf/distance-units';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/app/actions/notification-preferences';
import {
  DELIVERY_NOTIFICATION_GROUPS,
  type DeliveryNotificationKey,
  type DeliveryNotificationPreferences,
} from '@/lib/coachhelm/v3/notifications/types';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { JoinTeamSection } from '@/components/golf/settings/JoinTeamSection';
import { CoachHelmToggle } from '@/components/golf/coachhelm/v2';
import {
  IconUser,
  IconMail,
  IconShield,
  IconBell,
  IconChevronRight,
  IconLogout,
  IconCopy,
  IconCheck,
  IconRefresh,
  IconRuler,
  IconSun,
  IconMoon,
  IconMonitor,
} from '@/components/icons';
import { useGolfTheme, type GolfTheme } from '@/lib/golf/theme';

import {
  ViewHeader,
  Surface,
  Button,
  Input,
  Select,
  Switch,
  Slider,
  Avatar,
  InlineNotice,
  fairwayToast,
} from '@/components/fairway';
import { SettingsToggleRow } from '@/components/fairway/settings/settings-list';
import {
  EVENT_REMINDER_DEFAULTS,
  EVENT_REMINDER_RANGES,
  resolveEventReminderSettings,
  formatLead,
} from '@/lib/golf/event-reminder-settings';
// Specific path (not the barrel) so barrel-mocking tests don't need to stub it.
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

const EM_DASH = '—';

/**
 * Recruiting-only notification categories that GolfHelm never emits. The shared
 * DELIVERY_NOTIFICATION_GROUPS list carries `pipeline` (recruiting pipeline) and
 * `profile_views` (recruit profile views) for the baseball recruiting product;
 * surfacing them here gave golf users toggles that persist a preference nothing
 * golf ever fires. Filtered out of the golf notifications panel (presentation
 * only — the delivery-gate keys + defaults are untouched).
 */
const GOLF_HIDDEN_NOTIFICATION_IDS: ReadonlySet<string> = new Set(['pipeline', 'profile_views']);
const GOLF_NOTIFICATION_GROUPS = DELIVERY_NOTIFICATION_GROUPS.filter(
  (g) => !GOLF_HIDDEN_NOTIFICATION_IDS.has(g.id),
);

/* ── unsaved-changes plumbing (P379 dirty-tracking · P380 leave guard) ──────── */

/**
 * A tiny per-screen registry every Save-form panel reports its dirty state into,
 * keyed by a stable panel id. The shell reads the aggregate to (a) warn before a
 * full-tab close/refresh (`beforeunload`) and (b) intercept in-app navigation
 * (sidebar links, the browser back gesture) so editing a field and leaving never
 * silently discards the edit (P380, Nielsen #3 user control & freedom).
 */
interface DirtyRegistry {
  setDirty: (id: string, dirty: boolean) => void;
  clear: (id: string) => void;
}

const DirtyRegistryContext = createContext<DirtyRegistry | null>(null);

/**
 * Panel hook: report whether this panel currently has unsaved edits. A panel is
 * dirty when its live values differ from the snapshot it loaded with. Disabling
 * Save when pristine + skipping the no-op write/toast is owned by the panel; this
 * hook only threads the flag up to the screen-level leave guard.
 */
function useReportDirty(id: string, dirty: boolean) {
  const reg = useContext(DirtyRegistryContext);
  useEffect(() => {
    reg?.setDirty(id, dirty);
  }, [reg, id, dirty]);
  // On unmount (panel removed / role flip), stop counting this panel as dirty.
  useEffect(() => {
    return () => reg?.clear(id);
  }, [reg, id]);
}

/**
 * Screen-level guard. Tracks the set of dirty panel ids; while any panel is dirty
 * it (1) arms the native `beforeunload` prompt (covers refresh / tab close /
 * external nav) and (2) intercepts same-origin in-app link clicks + the back
 * gesture, showing a "Discard unsaved changes?" confirm before allowing the
 * navigation to proceed. Reduced-motion / token-safe (confirm is ConfirmDialog).
 */
function UnsavedChangesGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dirtyIdsRef = useRef<Set<string>>(new Set());
  const [anyDirty, setAnyDirty] = useState(false);
  // The pending navigation captured while a confirm is shown.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const recompute = useCallback(() => {
    setAnyDirty(dirtyIdsRef.current.size > 0);
  }, []);

  const registry = useMemo<DirtyRegistry>(
    () => ({
      setDirty: (id, dirty) => {
        const set = dirtyIdsRef.current;
        const had = set.has(id);
        if (dirty && !had) set.add(id);
        else if (!dirty && had) set.delete(id);
        else return;
        recompute();
      },
      clear: (id) => {
        if (dirtyIdsRef.current.delete(id)) recompute();
      },
    }),
    [recompute],
  );

  // (1) Native prompt for refresh / tab close / hard navigation.
  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers require returnValue to be set to trigger the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [anyDirty]);

  // (2a) Intercept in-app link clicks (sidebar / footer / inline links) so a
  // soft navigation is gated by the same confirm. Capture phase so it runs
  // before Next's Link handler; only same-tab, unmodified left-clicks to an
  // in-app href are intercepted.
  useEffect(() => {
    if (!anyDirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      const target = anchor.getAttribute('target');
      if (!href || href.startsWith('#') || (target && target !== '_self')) return;
      // Only guard same-origin internal navigations that LEAVE settings.
      let dest: URL;
      try {
        dest = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (dest.origin !== window.location.origin) return;
      if (dest.pathname === window.location.pathname) return; // same page (anchors)
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(dest.pathname + dest.search + dest.hash);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [anyDirty]);

  // (2b) Intercept the browser back/forward gesture.
  useEffect(() => {
    if (!anyDirty) return;
    // Seed a history entry so the first back press fires popstate here.
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      // Re-seed so we stay put until the user confirms.
      window.history.pushState(null, '', window.location.href);
      setPendingHref('__back__');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [anyDirty]);

  const confirmLeave = useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    // Dropping the guard: edits are intentionally discarded.
    dirtyIdsRef.current.clear();
    setAnyDirty(false);
    if (href === '__back__') {
      router.back();
    } else if (href) {
      router.push(href);
    }
  }, [pendingHref, router]);

  return (
    <DirtyRegistryContext.Provider value={registry}>
      {children}
      <ConfirmDialog
        open={pendingHref !== null}
        title="Discard unsaved changes?"
        message="You have unsaved edits on this screen. If you leave now, those changes will be lost."
        confirmLabel="Discard & leave"
        cancelLabel="Keep editing"
        variant="danger"
        onConfirm={confirmLeave}
        onCancel={() => setPendingHref(null)}
      />
    </DirtyRegistryContext.Provider>
  );
}

interface PlayerData {
  first_name: string | null;
  last_name: string | null;
  handicap: number | null;
  handicap_index: number | null;
  graduation_year: number | null;
  hometown: string | null;
  state: string | null;
  phone: string | null;
}

interface SettingsProfile {
  userId: string;
  coachId?: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: 'coach' | 'player';
  teamName?: string;
  teamId?: string;
  organizationId?: string;
  playerId?: string;
  playerData?: PlayerData;
  currentTeam?: {
    id: string;
    name: string;
    organization?: { name: string } | null;
  } | null;
}

/* ── shared section card ──────────────────────────────────────────────────── */

export function SectionCard({
  icon,
  title,
  description,
  headerAction,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** Optional right-aligned header slot (e.g. the auto-save indicator, P384). */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // The heading sits OUTSIDE the card, as a tracked eyebrow rather than a
    // display-scale h2 inside it. Thirty-nine of these stacked down the page,
    // each with an h2 and 32px of padding, is what made settings read as a
    // long form instead of a settings app — every card announced itself at the
    // same weight as the page title, and scanning meant reading, not glancing.
    // Restyled HERE so all 39 call sites inherit it without touching their
    // bodies (2026-07-25).
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5 px-1">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-text-tertiary [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            {title}
          </h2>
          {description ? (
            <p className="font-fw-sans text-caption text-text-secondary">{description}</p>
          ) : null}
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {/* md (24px), not lg (32px): the title no longer lives in here, so the
          card is pure content and the extra air only cost screens. */}
      <Surface elevation="border" padding="md">
        {children}
      </Surface>
    </section>
  );
}

/**
 * P384: the auto-save signal for panels that commit instantly on toggle/click
 * (Appearance, Distance units, Notifications) — so users aren't left unsure
 * whether a Save button was needed. Flashes "Saved" briefly after a change,
 * resting on a quiet "Auto-saves" label otherwise. Tokens only; honest (only
 * announces "Saved" when a change actually committed).
 */
export function AutoSaveBadge({ savedAt }: { savedAt: number | null }) {
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (savedAt === null) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1800);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-fw-sans text-caption font-medium',
        showSaved ? 'bg-accent-50 text-accent-700' : 'bg-surface-sunken text-text-tertiary',
      )}
      role="status"
      aria-live="polite"
    >
      {showSaved ? (
        <>
          <IconCheck size={12} aria-hidden />
          Saved
        </>
      ) : (
        'Auto-saves'
      )}
    </span>
  );
}

/** Shared visual recipe for every field label (input-bound or group/display). */
const FIELD_LABEL_CLASS =
  'mb-1.5 block font-fw-sans text-body-sm font-medium text-text-secondary';

/**
 * Visual-only label for non-control rows — button groups (display density, tees,
 * benchmark…) and read-only display values (current email, invite code/link).
 * These have no single focusable control to associate, so a plain <span> is the
 * correct, honest markup. For real text inputs use `LabeledField` instead.
 */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className={FIELD_LABEL_CLASS}>{children}</span>;
}

/**
 * A11y (P372): label↔control association for every text input. Wraps the control
 * in Base UI's `Field` so the rendered <label> auto-wires `htmlFor` to the
 * control's generated `id` (WCAG 1.3.1/3.3.2/4.1.2) — screen readers, voice
 * control and click-to-focus all work, with no manual id bookkeeping. The
 * Fairway `Input` registers itself as the field control when nested here.
 */
function LabeledField({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Field.Root className={className}>
      <Field.Label className={FIELD_LABEL_CLASS}>{label}</Field.Label>
      {children}
    </Field.Root>
  );
}

function SaveRow({
  onSave,
  busy,
  label = 'Save changes',
  disabled = false,
}: {
  onSave: () => void;
  busy: boolean;
  label?: string;
  /** P379: disable Save when the form is pristine (no real changes to commit). */
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end border-t border-border-subtle pt-4">
      <Button variant="primary" size="sm" busy={busy} disabled={disabled} onClick={onSave}>
        {label}
      </Button>
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */

export function FairwaySettingsGeneral() {
  const golfUser = useGolfUser();
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    // B16: a failed fetch must NOT leave the page stuck on an infinite skeleton.
    // Reset the error flag, then surface a retryable error card on throw.
    setLoadError(false);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || '';

      if (golfUser.role === 'coach') {
        setProfile({
          userId: golfUser.userId,
          coachId: golfUser.coachId,
          name: golfUser.name,
          email,
          avatarUrl: golfUser.avatarUrl || null,
          role: 'coach',
          teamName: golfUser.teamName,
          teamId: golfUser.teamId,
          organizationId: golfUser.organizationId,
        });
        return;
      }

      if (golfUser.playerId) {
        const [playerResult, teamResult] = await Promise.all([
          supabase
            .from('golf_players')
            .select('first_name, last_name, avatar_url, handicap, handicap_index, graduation_year, hometown, state, phone')
            .eq('id', golfUser.playerId)
            .maybeSingle(),
          golfUser.teamId
            ? supabase
                .from('golf_teams')
                .select('id, name, organization:organizations(name)')
                .eq('id', golfUser.teamId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const player = playerResult.data;
        const team = teamResult.data;

        let currentTeam: SettingsProfile['currentTeam'] = null;
        if (team) {
          const org = Array.isArray(team.organization) ? team.organization[0] : team.organization;
          currentTeam = {
            id: team.id,
            name: team.name,
            organization: org ? { name: org.name } : null,
          };
        }

        setProfile({
          userId: golfUser.userId,
          name: golfUser.name,
          email,
          avatarUrl: player?.avatar_url ?? golfUser.avatarUrl ?? null,
          role: 'player',
          teamName: golfUser.teamName,
          playerId: golfUser.playerId,
          currentTeam,
          playerData: player
            ? {
                first_name: player.first_name,
                last_name: player.last_name,
                handicap: player.handicap,
                handicap_index: player.handicap_index,
                graduation_year: player.graduation_year,
                hometown: player.hometown,
                state: player.state,
                phone: player.phone,
              }
            : undefined,
        });
      }
    } catch (err) {
      setLoadError(true);
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'FairwaySettingsGeneral', action: 'load-profile', sport: 'golf' },
        'medium'
      );
    }
  }, [golfUser]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSignOut = async () => {
    void triggerHaptic('heavy');
    const supabase = createClient();
    await clearActiveTeam();
    await supabase.auth.signOut();
    window.location.href = '/golf/login';
  };

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const response = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        void triggerHaptic('error');
        fairwayToast.error(payload.error || 'Failed to delete account');
        logError(
          new Error(payload.error || `Failed to delete account (status ${response.status})`),
          { component: 'FairwaySettingsGeneral', action: 'delete-account', sport: 'golf', statusCode: response.status },
          'critical'
        );
        return;
      }
      void triggerHaptic('success');
      fairwayToast.success('Account deleted successfully');
      window.location.href = isNativeApp() ? '/golf/login' : '/';
    } catch (err) {
      void triggerHaptic('error');
      fairwayToast.error('Failed to delete account');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'FairwaySettingsGeneral', action: 'delete-account', sport: 'golf' },
        'critical'
      );
    } finally {
      setDeletingAccount(false);
      setDeleteConfirmOpen(false);
    }
  };

  if (loadError && !profile) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8 pb-24">
        <ViewHeader eyebrow="Settings" title="Settings" />
        <Surface elevation="border" padding="lg" className="mt-8 flex flex-col items-start gap-3">
          <h2 className="font-fw-display text-h2 text-text-primary">Couldn&rsquo;t load settings</h2>
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Something went wrong loading your account. Please try again.
          </p>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<IconRefresh size={16} aria-hidden />}
            onClick={() => void loadProfile()}
          >
            Retry
          </Button>
        </Surface>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8 pb-24">
        <ViewHeader eyebrow="Settings" title="Settings" />
        <div className="mt-8 flex flex-col gap-7" role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading settings…</span>
          {[1, 2, 3].map((i) => (
            <Surface key={i} elevation="border" padding="lg">
              <Skeleton className="h-5 w-40 rounded" />
              <Skeleton className="mt-3 h-3 w-64 rounded" />
            </Surface>
          ))}
        </div>
      </div>
    );
  }

  return (
    <UnsavedChangesGuard>
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Settings"
        title="Settings"
        description="Manage your account and preferences."
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span className="capitalize">{profile.role}</span>
            {profile.teamName ? (
              <>
                <span aria-hidden>·</span>
                <span>{profile.teamName}</span>
              </>
            ) : null}
          </span>
        }
      />

      <div className="mt-8 flex flex-col gap-7">
        {/* Identity card */}
        <Surface elevation="border" padding="md" className="flex items-center gap-4">
          <Avatar src={profile.avatarUrl ?? undefined} name={profile.name} size="lg" />
          <div className="min-w-0">
            <p className="font-fw-sans text-body-lg font-medium text-text-primary">
              {profile.name || EM_DASH}
            </p>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              {profile.email || EM_DASH}
            </p>
          </div>
        </Surface>

        {/* Account */}
        <PersonalInfoPanel profile={profile} onUpdate={loadProfile} />
        <EmailPanel currentEmail={profile.email} />
        <PasswordPanel />

        {/* Preferences */}
        <AppearancePanel />
        <DistanceUnitsPanel />
        {/* Notifications — coach + player. Writes users.notification_preferences,
            the column the email/push delivery gate actually reads. */}
        <NotificationsPanel />
        {profile.role === 'player' ? (
          <Surface elevation="border" padding="none">
            <Link
              href="/golf/dashboard/settings/notifications"
              className="flex items-center gap-3 p-5 outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-sm bg-surface-sunken text-text-secondary">
                <IconBell size={18} aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-fw-sans text-body font-medium text-text-primary">
                  Per-category notifications
                </span>
                <span className="block font-fw-sans text-body-sm text-text-secondary">
                  Fine-grained AI insight & goal channels.
                </span>
              </span>
              <IconChevronRight size={18} className="shrink-0 text-text-tertiary" aria-hidden />
            </Link>
          </Surface>
        ) : null}
        {profile.role === 'coach' ? (
          <Surface elevation="border" padding="none">
            <Link
              href="/golf/dashboard/settings/coaching-intelligence"
              className="flex items-center gap-3 p-5 outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-sm bg-surface-sunken text-text-secondary">
                <IconShield size={18} aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-fw-sans text-body font-medium text-text-primary">
                  Coaching Intelligence
                </span>
                <span className="block font-fw-sans text-body-sm text-text-secondary">
                  CoachHelm AI insights, priorities and alerts.
                </span>
              </span>
              <IconChevronRight size={18} className="shrink-0 text-text-tertiary" aria-hidden />
            </Link>
          </Surface>
        ) : null}

        {/* Golf settings */}
        {profile.role === 'coach' && profile.teamId ? (
          <>
            <GolfScoringPanel teamId={profile.teamId} />
            <EventRemindersPanel teamId={profile.teamId} />
          </>
        ) : null}
        {profile.role === 'player' && profile.playerId ? (
          <PlayerGolfDetailsPanel
            playerId={profile.playerId}
            playerData={profile.playerData}
            onUpdate={loadProfile}
          />
        ) : null}

        {/* AI features (coach) */}
        {profile.role === 'coach' && profile.coachId ? (
          <SectionCard
            icon={<IconShield size={18} aria-hidden />}
            title="CoachHelm on your dashboards"
            // Disambiguated from the team-wide master switch in Coaching
            // Intelligence — this one only controls the current coach's own view.
            description="Show or hide CoachHelm on your own dashboards. The team-wide master switch lives in Coaching Intelligence."
          >
            <CoachHelmToggle coachId={profile.coachId} />
          </SectionCard>
        ) : null}

        {/* Team */}
        {profile.role === 'coach' ? (
          <TeamSettingsPanel onUpdate={loadProfile} />
        ) : null}
        {profile.role === 'coach' ? <InviteSettingsPanel /> : null}
        {profile.role === 'player' && profile.playerId ? (
          <JoinTeamSection playerId={profile.playerId} currentTeam={profile.currentTeam} />
        ) : null}

        {/* Legal */}
        <Surface elevation="border" padding="none">
          <Link
            href="/privacy"
            className="flex items-center gap-3 border-b border-border-subtle p-5 outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
          >
            <span className="flex-1 font-fw-sans text-body font-medium text-text-primary">
              Privacy Policy
            </span>
            <IconChevronRight size={18} className="shrink-0 text-text-tertiary" aria-hidden />
          </Link>
          <Link
            href="/terms"
            className="flex items-center gap-3 p-5 outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
          >
            <span className="flex-1 font-fw-sans text-body font-medium text-text-primary">
              Terms of Service
            </span>
            <IconChevronRight size={18} className="shrink-0 text-text-tertiary" aria-hidden />
          </Link>
        </Surface>

        {/* Danger zone */}
        <Surface elevation="border" padding="lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-fw-sans text-body font-medium text-text-primary">
                Delete account
              </p>
              <p className="font-fw-sans text-body-sm text-text-secondary">
                Permanently remove your account and all data.
              </p>
            </div>
            <Button
              variant="danger"
              busy={deletingAccount}
              onClick={() => {
                void triggerHaptic('warning');
                setDeleteConfirmOpen(true);
              }}
            >
              Delete account
            </Button>
          </div>
        </Surface>

        {/* Sign out */}
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<IconLogout size={16} aria-hidden />}
          onClick={() => void handleSignOut()}
        >
          Sign out
        </Button>

        <p className="py-2 text-center font-fw-sans text-caption text-text-tertiary">
          GolfHelm · © 2026 Helm Sports Labs
        </p>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete account?"
        message="This will permanently delete your account and all associated data. This action cannot be undone."
        confirmLabel="Delete Account"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingAccount}
        onConfirm={confirmDeleteAccount}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
    </UnsavedChangesGuard>
  );
}

/* ── Personal info ────────────────────────────────────────────────────────── */

export function PersonalInfoPanel({
  profile,
  onUpdate,
}: {
  profile: SettingsProfile;
  onUpdate: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const initialFirstName = profile.playerData?.first_name || '';
  const initialLastName = profile.playerData?.last_name || '';
  const initialFullName = profile.role === 'coach' ? profile.name : '';
  const initialAvatarUrl = profile.avatarUrl || null;
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [fullName, setFullName] = useState(initialFullName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);

  // P379: dirty when any field differs from the loaded snapshot.
  const isDirty =
    profile.role === 'coach'
      ? fullName !== initialFullName || avatarUrl !== initialAvatarUrl
      : firstName !== initialFirstName ||
        lastName !== initialLastName ||
        avatarUrl !== initialAvatarUrl;
  useReportDirty('personal-info', isDirty);

  const handleSave = async () => {
    if (!isDirty) return; // P379: nothing changed — no write, no false toast.
    setSaving(true);
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (profile.role === 'coach') {
        const { error } = await supabase
          .from('golf_coaches')
          .update({ full_name: fullName.trim(), avatar_url: avatarUrl })
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('golf_players')
          .update({ first_name: firstName.trim(), last_name: lastName.trim(), avatar_url: avatarUrl })
          .eq('user_id', user.id);
        if (error) throw error;
      }

      fairwayToast.success('Profile updated');
      onUpdate();
      router.refresh();
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to update profile');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'PersonalInfoPanel', action: 'update-profile', sport: 'golf', role: profile.role },
        'high'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard icon={<IconUser size={18} aria-hidden />} title="Personal information">
      <div className="space-y-4">
        <div>
          <FieldLabel>Profile picture</FieldLabel>
          <AvatarUpload
            currentAvatarUrl={avatarUrl}
            name={profile.role === 'coach' ? fullName : `${firstName} ${lastName}`}
            onUploadComplete={(url) => setAvatarUrl(url)}
            onRemove={() => setAvatarUrl(null)}
          />
        </div>

        {profile.role === 'coach' ? (
          <LabeledField label="Full name">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Coach Smith"
            />
          </LabeledField>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="First name">
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
              />
            </LabeledField>
            <LabeledField label="Last name">
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
              />
            </LabeledField>
          </div>
        )}
      </div>
      <SaveRow onSave={handleSave} busy={saving} disabled={!isDirty} />
    </SectionCard>
  );
}

/* ── Email ────────────────────────────────────────────────────────────────── */

export function EmailPanel({ currentEmail }: { currentEmail: string }) {
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  // P383: the address the user has a confirmation pending for (Supabase confirm-
  // email is async, so the current-email row keeps showing the OLD address until
  // the link is clicked — surface that "change pending" state explicitly).
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // P379: dirty only when there's a real, different new address to submit. The
  // field starts empty, so a no-op save is impossible — but we still gate the
  // button + the leave guard on having typed something.
  const trimmed = newEmail.trim();
  const isDirty = trimmed.length > 0 && trimmed !== currentEmail;
  useReportDirty('email', isDirty);

  const handleSave = async () => {
    if (!trimmed || !trimmed.includes('@')) {
      fairwayToast.error('Please enter a valid email');
      return;
    }
    if (trimmed === currentEmail) {
      fairwayToast.error('Same as current email');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      fairwayToast.success('Confirmation email sent. Check your inbox.');
      setPendingEmail(trimmed);
      setNewEmail('');
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to update email');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'EmailPanel', action: 'update-email', sport: 'golf' },
        'high'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard icon={<IconMail size={18} aria-hidden />} title="Email address">
      <div className="space-y-3">
        <div>
          <FieldLabel>Current email</FieldLabel>
          <div className="rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2 font-fw-sans text-body-sm text-text-secondary">
            {currentEmail || EM_DASH}
          </div>
          {/* P383: visible "change pending" state so the still-showing old
              address isn't read as the request having failed. */}
          {pendingEmail ? (
            <InlineNotice tone="info" className="mt-2">
              Change pending — we sent a confirmation to{' '}
              <span className="font-medium text-text-primary">{pendingEmail}</span>. Click the link
              in that email to switch your address.
            </InlineNotice>
          ) : null}
        </div>
        <LabeledField label="New email address">
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@example.com"
          />
        </LabeledField>
        <p className="font-fw-sans text-caption text-text-tertiary">
          We&rsquo;ll send a confirmation email to verify the change.
        </p>
      </div>
      <SaveRow onSave={handleSave} busy={saving} label="Send confirmation" disabled={!isDirty} />
    </SectionCard>
  );
}

/* ── Password ─────────────────────────────────────────────────────────────── */

export function PasswordPanel() {
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // P379: dirty once the user has typed into any field (no displayed value to
  // diff against — an empty form has nothing to save).
  const isDirty =
    currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0;
  useReportDirty('password', isDirty);

  const handleSave = async () => {
    if (!currentPassword) {
      fairwayToast.error('Enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      fairwayToast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      fairwayToast.error('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email;
      if (!email) throw new Error('Not authenticated');

      // Re-authenticate with the CURRENT password before changing it, so a
      // hijacked-but-signed-in session (or an unattended device) can't silently
      // change the password and lock the owner out. signInWithPassword only
      // refreshes this same user's session on success and leaves it untouched on
      // failure (invalid credentials) — no sign-out either way.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyError) {
        fairwayToast.error('Current password is incorrect');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      fairwayToast.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to update password');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'PasswordPanel', action: 'update-password', sport: 'golf' },
        'high'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard icon={<IconShield size={18} aria-hidden />} title="Password & security">
      <div className="space-y-3">
        <LabeledField label="Current password">
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
          />
        </LabeledField>
        <LabeledField label="New password">
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
          />
        </LabeledField>
        <LabeledField label="Confirm password">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        </LabeledField>
        <p className="font-fw-sans text-caption text-text-tertiary">
          At least 8 characters. Use a unique password.
        </p>
      </div>
      <SaveRow onSave={handleSave} busy={saving} label="Update password" disabled={!isDirty} />
    </SectionCard>
  );
}

/* ── Appearance ───────────────────────────────────────────────────────────── */

function OptionTile({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-auto min-h-[48px] items-start justify-start rounded-fw-sm border p-3 text-left font-normal',
        'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
        active
          ? 'border-accent-500 bg-accent-50 hover:bg-accent-50'
          : 'border-border-subtle hover:border-border-strong',
      )}
    >
      {/* B14: the Button base recipe sets `whitespace-nowrap` (correct for a
          single-line label) which is INHERITED by these descendant spans too —
          at narrow widths a longer hint (e.g. Meters' "International metric
          system · 137 m · 3 m putts") had nowhere to wrap and rendered its
          would-be second line stacked onto the first baseline, overlapping the
          title. `whitespace-normal` resets normal wrapping for this subtree. */}
      <span className="flex flex-col whitespace-normal">
        <span className="font-fw-sans text-body-sm font-medium text-text-primary">{title}</span>
        {hint ? <span className="font-fw-sans text-caption text-text-tertiary">{hint}</span> : null}
      </span>
    </Button>
  );
}

/**
 * A premium theme tile — icon over label, active = accent border + wash. The
 * whole appearance/theme system is token-driven, so the tile styling itself
 * adapts to light/dark automatically (accent-50/accent-500 are themed).
 */
function ThemeTile({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-auto min-h-[76px] flex-col items-center justify-center gap-2 rounded-fw-sm border p-3 font-normal',
        'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
        active
          ? 'border-accent-500 bg-accent-50 text-accent-700 hover:bg-accent-50'
          : 'border-border-subtle text-text-secondary hover:border-border-strong',
      )}
    >
      <span aria-hidden className={active ? 'text-accent-600' : 'text-text-tertiary'}>
        {icon}
      </span>
      <span className="font-fw-sans text-body-sm font-medium text-text-primary">{label}</span>
    </Button>
  );
}

const THEME_TILES: Array<{ value: GolfTheme; label: string; icon: React.ReactNode }> = [
  { value: 'light', label: 'Light', icon: <IconSun size={20} /> },
  { value: 'dark', label: 'Dark', icon: <IconMoon size={20} /> },
  { value: 'system', label: 'System', icon: <IconMonitor size={20} /> },
];

export function AppearancePanel() {
  const { displayDensity, dateFormat, showAnimations, scoreDisplay, updatePreferences } =
    useAppearancePreferences();
  const { theme, setTheme } = useGolfTheme();
  // P384: signal that this panel auto-saves (no Save button) and flash "Saved"
  // after each instant commit.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const update: typeof updatePreferences = (patch) => {
    updatePreferences(patch);
    setSavedAt(Date.now());
  };
  const chooseTheme = (next: GolfTheme) => {
    void triggerHaptic('light');
    setTheme(next);
    setSavedAt(Date.now());
  };

  return (
    <SectionCard
      icon={<IconUser size={18} aria-hidden />}
      title="Appearance"
      // P382: be honest about scope — these prefs are saved on THIS device only
      // (localStorage, no per-user DB column), so they don't follow you to
      // another machine or browser.
      description="Changes apply instantly across the app. Saved on this device only — they won't carry over to another computer or browser."
      headerAction={<AutoSaveBadge savedAt={savedAt} />}
    >
      <div className="space-y-5">
        {/* Theme — the most prominent appearance choice. System follows the OS
            light/dark setting live. */}
        <div>
          <FieldLabel>Theme</FieldLabel>
          <div className="grid grid-cols-3 gap-2">
            {THEME_TILES.map(({ value, label, icon }) => (
              <ThemeTile
                key={value}
                active={theme === value}
                onClick={() => chooseTheme(value)}
                icon={icon}
                label={label}
              />
            ))}
          </div>
          <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
            {theme === 'system'
              ? 'Matches your device’s light or dark setting automatically.'
              : `Always ${theme}, on this device.`}
          </p>
        </div>

        <div>
          <FieldLabel>Display density</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {(['comfortable', 'compact'] as const).map((opt) => (
              <OptionTile
                key={opt}
                active={displayDensity === opt}
                onClick={() => update({ displayDensity: opt })}
                title={opt.charAt(0).toUpperCase() + opt.slice(1)}
                hint={opt === 'comfortable' ? 'More spacing' : 'Denser layout'}
              />
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Date format</FieldLabel>
          <div className="grid gap-2">
            {([
              { val: 'MM/DD/YYYY' as const, ex: '01/28/2026' },
              { val: 'DD/MM/YYYY' as const, ex: '28/01/2026' },
              { val: 'YYYY-MM-DD' as const, ex: '2026-01-28' },
            ]).map(({ val, ex }) => (
              <Button
                variant="ghost"
                key={val}
                type="button"
                aria-pressed={dateFormat === val}
                onClick={() => update({ dateFormat: val })}
                className={cn(
                  'flex h-auto min-h-[48px] items-center justify-between rounded-fw-sm border px-3 py-2.5 text-left font-normal',
                  'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
                  dateFormat === val
                    ? 'border-accent-500 bg-accent-50 hover:bg-accent-50'
                    : 'border-border-subtle hover:border-border-strong',
                )}
              >
                <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                  {val}
                </span>
                <span className="font-fw-sans text-caption text-text-tertiary">{ex}</span>
              </Button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Score display</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <OptionTile
              active={scoreDisplay === 'to_par'}
              onClick={() => update({ scoreDisplay: 'to_par' })}
              title="Score to par"
              hint="E, +2, -1"
            />
            <OptionTile
              active={scoreDisplay === 'raw'}
              onClick={() => update({ scoreDisplay: 'raw' })}
              title="Raw score"
              hint="72, 74, 71"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-fw-sans text-body-sm font-medium text-text-primary">Animations</p>
            <p className="font-fw-sans text-caption text-text-tertiary">
              Enable smooth transitions and effects.
            </p>
          </div>
          <Switch
            checked={showAnimations}
            onCheckedChange={() => update({ showAnimations: !showAnimations })}
            aria-label="Animations"
          />
        </div>
      </div>
    </SectionCard>
  );
}

/* ── Distance units ───────────────────────────────────────────────────────── */

/** Restores the legacy yd/m display preference (localStorage-backed).
 *  Exported for tests — B14: the Meters card's hint text must wrap, not
 *  overlap the title. */
export function DistanceUnitsPanel() {
  const { distancePref, setDistancePref } = useDistanceUnits();
  // P384: auto-save signal (this panel commits instantly, no Save button).
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const options: Array<{
    value: DistancePreference;
    label: string;
    desc: string;
    example: string;
  }> = [
    { value: 'yards', label: 'Yards', desc: 'Standard US / golf measurement', example: '150 yds · 10 ft putts' },
    { value: 'meters', label: 'Meters', desc: 'International metric system', example: '137 m · 3 m putts' },
  ];

  return (
    <SectionCard
      icon={<IconRuler size={18} aria-hidden />}
      title="Distance units"
      // P382: honest scope — display-only AND device-local (localStorage, no
      // per-user DB column), so it won't follow you to another machine.
      description="Only affects display — all data is stored in yards and feet. Saved on this device only."
      headerAction={<AutoSaveBadge savedAt={savedAt} />}
    >
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ value, label, desc, example }) => (
          <OptionTile
            key={value}
            active={distancePref === value}
            onClick={() => {
              void triggerHaptic('light');
              setDistancePref(value);
              setSavedAt(Date.now());
            }}
            title={label}
            hint={`${desc} · ${example}`}
          />
        ))}
      </div>
    </SectionCard>
  );
}

/* ── Notifications (coach + player) ────────────────────────────────────────── */

/**
 * Writes users.notification_preferences — the JSONB column the email/push
 * delivery gate (getUserNotificationPreferences → shouldSendEmail) actually
 * reads. Each row gates an email and (where the channel exists) a push channel;
 * quiet mode silences everything except the quiet-exempt rows. Available to
 * BOTH coaches and players (the live shell previously gave coaches no UI here).
 */
export function NotificationsPanel() {
  const [prefs, setPrefs] = useState<DeliveryNotificationPreferences | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  // P384: auto-save signal (each toggle persists immediately, no Save button).
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    const res = await getNotificationPreferences();
    if (res.error || !res.data) {
      setLoadFailed(true);
      logError(
        new Error(res.error || 'Failed to load notification preferences'),
        { component: 'NotificationsPanel', action: 'load-notification-preferences', sport: 'golf' },
        'medium'
      );
      return;
    }
    setPrefs(res.data as DeliveryNotificationPreferences);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Optimistic single-key toggle: flip locally, persist, roll back on failure.
  const toggle = useCallback(
    async (key: DeliveryNotificationKey | 'quiet_mode', next: boolean) => {
      if (!prefs) return;
      const previous = prefs;
      const optimistic = { ...prefs, [key]: next };
      setPrefs(optimistic);
      setSaving(true);
      const res = await updateNotificationPreferences({ [key]: next });
      setSaving(false);
      if (!res.success) {
        setPrefs(previous);
        void triggerHaptic('error');
        fairwayToast.error(res.error || 'Failed to save preference');
        logError(
          new Error(res.error || 'Failed to save notification preference'),
          { component: 'NotificationsPanel', action: 'toggle-notification-preference', sport: 'golf', key },
          'high'
        );
      } else {
        void triggerHaptic('light');
        setSavedAt(Date.now()); // P384: flash the auto-save "Saved" signal.
      }
    },
    [prefs],
  );

  if (loadFailed && !prefs) {
    return (
      <SectionCard icon={<IconBell size={18} aria-hidden />} title="Notifications">
        <div className="flex flex-col items-start gap-3">
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Couldn&rsquo;t load your notification preferences.
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<IconRefresh size={16} aria-hidden />}
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      </SectionCard>
    );
  }

  if (!prefs) {
    return (
      <SectionCard icon={<IconBell size={18} aria-hidden />} title="Notifications">
        <div className="space-y-3" role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading notification preferences…</span>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<IconBell size={18} aria-hidden />}
      title="Notifications"
      description="Choose how each kind of update reaches you."
      headerAction={<AutoSaveBadge savedAt={savedAt} />}
    >
      <div className="space-y-1">
        {/* Quiet mode */}
        <div className="flex items-center justify-between gap-3 rounded-fw-sm bg-surface-sunken p-3">
          <div className="min-w-0">
            <p className="font-fw-sans text-body-sm font-medium text-text-primary">Quiet mode</p>
            <p className="font-fw-sans text-caption text-text-tertiary">
              Silences everything except messages.
            </p>
          </div>
          <Switch
            checked={prefs.quiet_mode}
            onCheckedChange={(v) => void toggle('quiet_mode', v)}
            disabled={saving}
            aria-label="Quiet mode"
          />
        </div>

        {/* Column legend */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-1 pt-3 pb-1">
          <span />
          <span className="w-14 text-center font-fw-sans text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
            Email
          </span>
          <span className="w-14 text-center font-fw-sans text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
            Push
          </span>
        </div>

        {/* Per-category rows */}
        <ul className="divide-y divide-border-subtle">
          {GOLF_NOTIFICATION_GROUPS.map((group) => {
            const silenced = prefs.quiet_mode && !group.quietExempt;
            return (
              <li
                key={group.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-fw-sans text-body-sm font-medium text-text-primary">
                    {group.label}
                  </p>
                  <p className="font-fw-sans text-caption text-text-tertiary">
                    {silenced ? 'Silenced by quiet mode' : group.description}
                  </p>
                </div>
                <div className="flex w-14 justify-center">
                  <Switch
                    checked={prefs[group.emailKey]}
                    onCheckedChange={(v) => void toggle(group.emailKey, v)}
                    disabled={saving || silenced}
                    aria-label={`${group.label} email`}
                  />
                </div>
                <div className="flex w-14 justify-center">
                  {group.pushKey ? (
                    <Switch
                      checked={prefs[group.pushKey]}
                      onCheckedChange={(v) => void toggle(group.pushKey!, v)}
                      disabled={saving || silenced}
                      aria-label={`${group.label} push`}
                    />
                  ) : (
                    <span className="font-fw-sans text-caption text-text-tertiary" aria-hidden>
                      {EM_DASH}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
}

/* ── Event reminders (coach, team-wide) ───────────────────────────────────── */

/**
 * The team's automated event-reminder schedule.
 *
 * Separate from `GolfScoringPanel` even though both write `golf_team_settings`:
 * scoring/format describes how golf is recorded, this describes when the app
 * emails and pushes people. Different mental model, and a coach looking for
 * "why is my team getting texted at 6am" should not have to open a card called
 * "Scoring & format" to find it.
 *
 * Everything here was a module constant in `/api/cron/event-reminders` until
 * 2026-07-25 — every team on the platform got 24h + 1h, and the only way to
 * stop reminders was for each player to opt out individually.
 */
export function EventRemindersPanel({ teamId }: { teamId: string }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Explicit `boolean`: EVENT_REMINDER_DEFAULTS is `as const`, so inference
  // would narrow this to the literal `true` and reject setEnabled(false).
  const [enabled, setEnabled] = useState<boolean>(EVENT_REMINDER_DEFAULTS.enabled);
  const [earlyHours, setEarlyHours] = useState<number>(EVENT_REMINDER_DEFAULTS.earlyHours);
  const [lateMinutes, setLateMinutes] = useState<number>(EVENT_REMINDER_DEFAULTS.lateMinutes);
  const snapshotRef = useRef<{ enabled: boolean; earlyHours: number; lateMinutes: number }>({
    enabled: EVENT_REMINDER_DEFAULTS.enabled,
    earlyHours: EVENT_REMINDER_DEFAULTS.earlyHours,
    lateMinutes: EVENT_REMINDER_DEFAULTS.lateMinutes,
  });

  const load = useCallback(async () => {
    setLoadFailed(false);
    const { data, error } = await fromUntyped(supabase, 'golf_team_settings')
      .select('event_reminders_enabled, event_reminder_early_hours, event_reminder_late_minutes')
      .eq('team_id', teamId)
      .maybeSingle();

    if (error) {
      setLoadFailed(true);
      setLoaded(true);
      logError(
        new Error(error.message),
        { component: 'EventRemindersPanel', action: 'load-event-reminders', sport: 'golf', teamId },
        'medium',
      );
      return;
    }

    // A missing row is legitimate — the defaults ARE the behaviour a team gets
    // before anyone touches this, so they are not a lie in the way a faked
    // value would be.
    const next = resolveEventReminderSettings(data ?? null);
    setEnabled(next.enabled);
    setEarlyHours(next.earlyHours);
    setLateMinutes(next.lateMinutes);
    snapshotRef.current = next;
    setLoaded(true);
  }, [teamId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const snap = snapshotRef.current;
  const isDirty =
    enabled !== snap.enabled ||
    earlyHours !== snap.earlyHours ||
    lateMinutes !== snap.lateMinutes;
  useReportDirty('event-reminders', isDirty);

  // The DB enforces early > late (CHECK golf_team_settings_event_reminder_ordering).
  // Catch it here so the coach gets a sentence instead of a Postgres error, and
  // so Save is unavailable rather than failing.
  const ordering = earlyHours * 60 > lateMinutes;

  const handleSave = async () => {
    if (!isDirty || !ordering) return;
    setSaving(true);
    try {
      const { error } = await fromUntyped(supabase, 'golf_team_settings').upsert(
        {
          team_id: teamId,
          event_reminders_enabled: enabled,
          event_reminder_early_hours: earlyHours,
          event_reminder_late_minutes: lateMinutes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'team_id' },
      );
      if (error) throw error;
      snapshotRef.current = { enabled, earlyHours, lateMinutes };
      fairwayToast.success('Reminder schedule updated');
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to save');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'EventRemindersPanel', action: 'save-event-reminders', sport: 'golf', teamId },
        'high',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <SectionCard icon={<IconBell size={18} aria-hidden />} title="Event reminders">
        <div role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading event reminder settings…</span>
          {/* Shape-matched to the loaded panel: one toggle row, two sliders. */}
          <div className="flex flex-col gap-4">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </div>
      </SectionCard>
    );
  }

  if (loadFailed) {
    return (
      <SectionCard icon={<IconBell size={18} aria-hidden />} title="Event reminders">
        <InlineNotice
          tone="danger"
          action={
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          Couldn’t load your reminder schedule.
        </InlineNotice>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<IconBell size={18} aria-hidden />}
      title="Event reminders"
      description="Automatic reminders for everyone invited to a team event."
    >
      <div className="flex flex-col gap-1">
        <SettingsToggleRow
          label="Send event reminders"
          description="Applies to every player on the roster. Individual players can still mute their own channels."
          checked={enabled}
          onCheckedChange={setEnabled}
        />

        {enabled ? (
          <>
            <div className="border-t border-border-subtle px-1 pt-4">
              <Slider
                label="First reminder"
                description="How far ahead of an event the first reminder goes out."
                value={earlyHours}
                onValueChange={setEarlyHours}
                {...EVENT_REMINDER_RANGES.earlyHours}
                displayTransform={(n) => n}
                unit="hours"
              />
            </div>
            <div className="px-1 pt-4">
              <Slider
                label="Final reminder"
                description="A last nudge shortly before the event starts."
                value={lateMinutes}
                onValueChange={setLateMinutes}
                {...EVENT_REMINDER_RANGES.lateMinutes}
                unit="min"
              />
            </div>
            <p className="px-1 pt-3 font-fw-sans text-caption text-text-tertiary">
              {ordering
                ? `Players are reminded ${formatLead(earlyHours * 60)} before an event, then again ${formatLead(lateMinutes)} before it starts. Reminders are checked hourly, so one can arrive up to 15 minutes early — never late.`
                : 'The first reminder has to come before the final one.'}
            </p>
          </>
        ) : (
          <p className="px-1 pt-3 font-fw-sans text-caption text-text-tertiary">
            No automatic reminders are sent. Players still see events on the calendar.
          </p>
        )}
      </div>

      <SaveRow onSave={handleSave} busy={saving} disabled={!isDirty || !ordering} />
    </SectionCard>
  );
}

/* ── Golf scoring (coach) ─────────────────────────────────────────────────── */

export function GolfScoringPanel({ teamId }: { teamId: string }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // B3/B4: a failed read must surface a retryable error, NOT silently render
  // the hard-coded defaults below as if they were the team's saved settings.
  const [loadFailed, setLoadFailed] = useState(false);
  const [scoringFormat, setScoringFormat] = useState('stroke_play');
  const [handicapSystem, setHandicapSystem] = useState('usga');
  const [defaultTees, setDefaultTees] = useState('blue');
  const [timezone, setTimezone] = useState('America/New_York');
  // P379: snapshot of the loaded (or saved) values so a no-op save is skipped and
  // Save disables while pristine. Seeded with the first-time-setup defaults so an
  // untouched form (missing row) is correctly pristine.
  const snapshotRef = useRef({
    scoringFormat: 'stroke_play',
    handicapSystem: 'usga',
    defaultTees: 'blue',
    timezone: 'America/New_York',
  });

  const load = useCallback(async () => {
    setLoadFailed(false);
    const { data, error } = await fromUntyped(supabase, 'golf_team_settings')
      .select('scoring_format, handicap_system, default_tees, timezone')
      .eq('team_id', teamId)
      .maybeSingle();

    // A missing row (no error, data === null) is legitimate — defaults stand in
    // as the first-time setup state. A real query error is NOT — flag it.
    if (error) {
      setLoadFailed(true);
      setLoaded(true);
      logError(
        new Error(error.message),
        { component: 'GolfScoringPanel', action: 'load-golf-team-settings', sport: 'golf', teamId },
        'medium'
      );
      return;
    }

    if (data) {
      const next = {
        scoringFormat: data.scoring_format || 'stroke_play',
        handicapSystem: data.handicap_system || 'usga',
        defaultTees: data.default_tees || 'blue',
        timezone: data.timezone || 'America/New_York',
      };
      setScoringFormat(next.scoringFormat);
      setHandicapSystem(next.handicapSystem);
      setDefaultTees(next.defaultTees);
      setTimezone(next.timezone);
      snapshotRef.current = next;
    }
    setLoaded(true);
  }, [teamId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const snap = snapshotRef.current;
  const isDirty =
    scoringFormat !== snap.scoringFormat ||
    handicapSystem !== snap.handicapSystem ||
    defaultTees !== snap.defaultTees ||
    timezone !== snap.timezone;
  useReportDirty('golf-scoring', isDirty);

  const handleSave = async () => {
    if (!isDirty) return; // P379: no real changes — skip the write + false toast.
    setSaving(true);
    try {
      const { error } = await fromUntyped(supabase, 'golf_team_settings').upsert(
        {
          team_id: teamId,
          scoring_format: scoringFormat,
          handicap_system: handicapSystem,
          default_tees: defaultTees,
          timezone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'team_id' },
      );
      if (error) throw error;
      // P379: persisted values are now the pristine baseline.
      snapshotRef.current = {
        scoringFormat,
        handicapSystem,
        defaultTees,
        timezone,
      };
      fairwayToast.success('Golf settings updated');
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to save');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'GolfScoringPanel', action: 'save-golf-team-settings', sport: 'golf', teamId },
        'high'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <SectionCard icon={<IconUser size={18} aria-hidden />} title="Scoring & format">
        <div role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading scoring and format settings…</span>
          <Skeleton className="h-8 w-full" />
        </div>
      </SectionCard>
    );
  }

  if (loadFailed) {
    return (
      <SectionCard icon={<IconUser size={18} aria-hidden />} title="Scoring & format">
        <div className="flex flex-col items-start gap-3">
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Couldn&rsquo;t load your scoring &amp; format settings.
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<IconRefresh size={16} aria-hidden />}
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<IconUser size={18} aria-hidden />}
      title="Scoring & format"
      description="Scoring format, handicap system, default tees and benchmark."
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Scoring format</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: 'stroke_play', label: 'Stroke Play', desc: 'Total strokes' },
              { val: 'match_play', label: 'Match Play', desc: 'Hole-by-hole' },
            ].map(({ val, label, desc }) => (
              <OptionTile
                key={val}
                active={scoringFormat === val}
                onClick={() => setScoringFormat(val)}
                title={label}
                hint={desc}
              />
            ))}
          </div>
        </div>

        <LabeledField label="Handicap system">
          <Select value={handicapSystem} onValueChange={(v) => setHandicapSystem(v as string)}>
            <Select.Item value="usga">USGA Handicap</Select.Item>
            <Select.Item value="world">World Handicap System</Select.Item>
            <Select.Item value="none">No Handicap</Select.Item>
          </Select>
        </LabeledField>

        <div>
          <FieldLabel>Default tees</FieldLabel>
          <div className="grid grid-cols-4 gap-1.5">
            {['black', 'blue', 'white', 'gold'].map((tee) => (
              <Button
                variant="ghost"
                key={tee}
                type="button"
                aria-pressed={defaultTees === tee}
                onClick={() => setDefaultTees(tee)}
                className={cn(
                  'h-auto rounded-fw-sm border px-2 py-2 text-center font-fw-sans text-body-sm font-medium capitalize',
                  'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
                  defaultTees === tee
                    ? 'border-accent-500 bg-accent-50 text-accent-700 hover:bg-accent-50'
                    : 'border-border-subtle text-text-secondary hover:border-border-strong',
                )}
              >
                {tee}
              </Button>
            ))}
          </div>
        </div>

        <LabeledField label="Timezone">
          <Select value={timezone} onValueChange={(v) => setTimezone(v as string)}>
            <Select.Item value="America/New_York">Eastern (ET)</Select.Item>
            <Select.Item value="America/Chicago">Central (CT)</Select.Item>
            <Select.Item value="America/Denver">Mountain (MT)</Select.Item>
            <Select.Item value="America/Los_Angeles">Pacific (PT)</Select.Item>
            <Select.Item value="America/Anchorage">Alaska (AKT)</Select.Item>
            <Select.Item value="Pacific/Honolulu">Hawaii (HT)</Select.Item>
          </Select>
        </LabeledField>

        {/* The Strokes-Gained baseline is NOT chosen here — it's derived
            automatically from the team's gender (PGA Tour for men's, LPGA for
            women's) by the gender-aware DB functions. The old editable "SG
            benchmark" picker wrote golf_team_settings.sg_benchmark_level, a
            column nothing reads, so it silently controlled nothing and
            contradicted the "set automatically" copy in Coaching Intelligence.
            Removed. The baseline is surfaced (read-only) under Coaching
            Intelligence → Strokes Gained baseline. */}
      </div>
      <SaveRow onSave={handleSave} busy={saving} disabled={!isDirty} />
    </SectionCard>
  );
}

/* ── Player golf details ──────────────────────────────────────────────────── */

export function PlayerGolfDetailsPanel({
  playerId,
  playerData,
  onUpdate,
}: {
  playerId: string;
  playerData?: PlayerData;
  onUpdate: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const initial = {
    handicap: playerData?.handicap?.toString() || '',
    handicapIndex: playerData?.handicap_index?.toString() || '',
    gradYear: playerData?.graduation_year?.toString() || '',
    hometown: playerData?.hometown || '',
    homeState: playerData?.state || '',
    phone: playerData?.phone || '',
  };
  const [handicap, setHandicap] = useState(initial.handicap);
  const [handicapIndex, setHandicapIndex] = useState(initial.handicapIndex);
  const [gradYear, setGradYear] = useState(initial.gradYear);
  const [hometown, setHometown] = useState(initial.hometown);
  const [homeState, setHomeState] = useState(initial.homeState);
  const [phone, setPhone] = useState(initial.phone);

  // P379: dirty when any field differs from the loaded snapshot.
  const isDirty =
    handicap !== initial.handicap ||
    handicapIndex !== initial.handicapIndex ||
    gradYear !== initial.gradYear ||
    hometown !== initial.hometown ||
    homeState !== initial.homeState ||
    phone !== initial.phone;
  useReportDirty('player-golf-details', isDirty);

  const handleSave = async () => {
    if (!isDirty) return; // P379: nothing changed — no write, no false toast.
    setSaving(true);
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('golf_players')
        .update({
          handicap: handicap ? parseFloat(handicap) : null,
          handicap_index: handicapIndex ? parseFloat(handicapIndex) : null,
          graduation_year: gradYear ? parseInt(gradYear) : null,
          hometown: hometown.trim() || null,
          state: homeState.trim() || null,
          phone: phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', playerId);

      if (error) throw error;
      fairwayToast.success('Golf details updated');
      onUpdate();
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to save');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'PlayerGolfDetailsPanel', action: 'save-golf-details', sport: 'golf', playerId },
        'high'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      icon={<IconUser size={18} aria-hidden />}
      title="Golf details"
      description="Handicap, graduation year and hometown."
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <LabeledField label="Handicap">
            <Input type="number" value={handicap} onChange={(e) => setHandicap(e.target.value)} placeholder="5.2" />
          </LabeledField>
          <LabeledField label="Handicap index">
            <Input
              type="number"
              value={handicapIndex}
              onChange={(e) => setHandicapIndex(e.target.value)}
              placeholder="4.8"
            />
          </LabeledField>
        </div>
        <LabeledField label="Graduation year">
          <Input type="number" value={gradYear} onChange={(e) => setGradYear(e.target.value)} placeholder="2027" />
        </LabeledField>
        <div className="grid grid-cols-2 gap-3">
          <LabeledField label="Hometown">
            <Input value={hometown} onChange={(e) => setHometown(e.target.value)} placeholder="Austin" />
          </LabeledField>
          <LabeledField label="State">
            <Input value={homeState} onChange={(e) => setHomeState(e.target.value)} placeholder="TX" maxLength={2} />
          </LabeledField>
        </div>
        <LabeledField label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </LabeledField>
      </div>
      <SaveRow onSave={handleSave} busy={saving} disabled={!isDirty} />
    </SectionCard>
  );
}

/* ── Team settings (coach) ────────────────────────────────────────────────── */

/** Exported for tests — must follow the program head's ACTIVE team toggle. */
export function TeamSettingsPanel({ onUpdate }: { onUpdate: () => void }) {
  const supabase = createClient();
  const golfUser = useGolfUser();
  // ACTIVE team from the layout-resolved context (cookie-aware) — the panel
  // must show and EDIT the same team every server page renders, so a program
  // head toggled to Women's edits the women's team here, never the default.
  const activeTeamId = golfUser.teamId ?? null;
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // B3/B4: a failed team/org read must surface a retryable error, never empty
  // inputs that masquerade as a team with no name/season/organization.
  const [loadFailed, setLoadFailed] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [season, setSeason] = useState('');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [division, setDivision] = useState('');
  const [conference, setConference] = useState('');
  // P379: snapshot of the loaded (or last-saved) values to gate Save + the leave
  // guard. Empty baseline until load() resolves; an unloaded panel is pristine.
  const snapshotRef = useRef({
    teamName: '',
    season: '',
    orgName: '',
    city: '',
    state: '',
    division: '',
    conference: '',
  });

  const load = useCallback(async () => {
    setLoadFailed(false);
    if (!activeTeamId) {
      setLoaded(true);
      return;
    }

    const { data: team, error: teamError } = await supabase
      .from('golf_teams')
      .select('id, name, season, organization_id')
      .eq('id', activeTeamId)
      .maybeSingle();

    if (teamError) {
      setLoadFailed(true);
      setLoaded(true);
      logError(
        new Error(teamError.message),
        { component: 'TeamSettingsPanel', action: 'load-team', sport: 'golf', teamId: activeTeamId },
        'medium'
      );
      return;
    }

    if (team) {
      setTeamId(team.id);
      setTeamName(team.name || '');
      setSeason(team.season || '');
      setOrganizationId(team.organization_id);
      snapshotRef.current = {
        ...snapshotRef.current,
        teamName: team.name || '',
        season: team.season || '',
      };

      if (team.organization_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: org, error: orgError } = await (supabase as any)
          .from('organizations')
          .select('name, location_city, location_state, division, conference')
          .eq('id', team.organization_id)
          .maybeSingle();
        if (orgError) {
          setLoadFailed(true);
          setLoaded(true);
          logError(
            new Error(orgError.message),
            { component: 'TeamSettingsPanel', action: 'load-organization', sport: 'golf', organizationId: team.organization_id },
            'medium'
          );
          return;
        }
        if (org) {
          setOrgName(org.name || '');
          setCity(org.location_city || '');
          setState(org.location_state || '');
          setDivision(org.division || '');
          setConference(org.conference || '');
          snapshotRef.current = {
            ...snapshotRef.current,
            orgName: org.name || '',
            city: org.location_city || '',
            state: org.location_state || '',
            division: org.division || '',
            conference: org.conference || '',
          };
        }
      }
    }
    setLoaded(true);
  }, [supabase, activeTeamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const snap = snapshotRef.current;
  const isDirty =
    teamName !== snap.teamName ||
    season !== snap.season ||
    orgName !== snap.orgName ||
    city !== snap.city ||
    state !== snap.state ||
    division !== snap.division ||
    conference !== snap.conference;
  useReportDirty('team-settings', isDirty);

  const handleSave = async () => {
    if (!teamId || !teamName.trim()) {
      fairwayToast.error('Team name required');
      return;
    }
    if (!isDirty) return; // P379: nothing changed — skip the write + false toast.
    setSaving(true);
    try {
      // B16/F150: the org update spans a DIFFERENT table (organizations, shared
      // across both gendered teams) than the team row. Run the cross-org write
      // FIRST and bail before touching golf_teams if it fails, so an org failure
      // can't leave the team renamed against stale org fields (half-applied save).
      if (organizationId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: orgError } = await (supabase as any)
          .from('organizations')
          .update({
            name: orgName.trim() || undefined,
            location_city: city.trim() || undefined,
            location_state: state.trim() || undefined,
            division: division.trim() || undefined,
            conference: conference.trim() || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', organizationId);
        if (orgError) throw orgError;
      }

      const { error: teamError } = await supabase
        .from('golf_teams')
        .update({ name: teamName.trim(), season: season.trim() || undefined, updated_at: new Date().toISOString() })
        .eq('id', teamId);
      if (teamError) throw teamError;

      // P379: persisted values are now the pristine baseline.
      snapshotRef.current = {
        teamName,
        season,
        orgName,
        city,
        state,
        division,
        conference,
      };
      fairwayToast.success('Team settings updated');
      onUpdate();
    } catch (err) {
      fairwayToast.error(err instanceof Error ? err.message : 'Failed to save');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'TeamSettingsPanel', action: 'save-team-settings', sport: 'golf', teamId },
        'high'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <SectionCard icon={<IconUser size={18} aria-hidden />} title="Team settings">
        <div role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading team settings…</span>
          <Skeleton className="h-8 w-full" />
        </div>
      </SectionCard>
    );
  }

  if (loadFailed) {
    return (
      <SectionCard icon={<IconUser size={18} aria-hidden />} title="Team settings">
        <div className="flex flex-col items-start gap-3">
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Couldn&rsquo;t load your team settings.
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<IconRefresh size={16} aria-hidden />}
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<IconUser size={18} aria-hidden />}
      title="Team settings"
      description="Program name, season and organization details."
    >
      <div className="space-y-4">
        <LabeledField label="Team name">
          <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Men's Golf Team" />
        </LabeledField>
        <LabeledField label="Season">
          <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025-2026" />
        </LabeledField>

        {organizationId ? (
          <div className="space-y-4 border-t border-border-subtle pt-4">
            <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Organization
            </p>
            <LabeledField label="School name">
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="University" />
            </LabeledField>
            <div className="grid grid-cols-2 gap-3">
              <LabeledField label="City">
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Los Angeles" />
              </LabeledField>
              <LabeledField label="State">
                <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="CA" maxLength={2} />
              </LabeledField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledField label="Division">
                <Input value={division} onChange={(e) => setDivision(e.target.value)} placeholder="Division I" />
              </LabeledField>
              <LabeledField label="Conference">
                <Input value={conference} onChange={(e) => setConference(e.target.value)} placeholder="Pac-12" />
              </LabeledField>
            </div>
          </div>
        ) : null}
      </div>
      <SaveRow onSave={handleSave} busy={saving} disabled={!isDirty} />
    </SectionCard>
  );
}

/* ── Invite settings (coach) ──────────────────────────────────────────────── */

/** Exported for tests — must follow the program head's ACTIVE team toggle. */
export function InviteSettingsPanel() {
  const supabase = createClient();
  const golfUser = useGolfUser();
  // ACTIVE team from the layout-resolved context (cookie-aware) — invite codes
  // must be generated for the team the program head is currently viewing.
  const activeTeamId = golfUser.teamId ?? null;
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // B3/B4: a failed read must surface a retryable error, never an empty
  // em-dash code that reads as "this team has no invite code".
  const [loadFailed, setLoadFailed] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    if (!activeTeamId) {
      setLoaded(true);
      return;
    }

    const { data: team, error } = await supabase
      .from('golf_teams')
      .select('id, join_code')
      .eq('id', activeTeamId)
      .maybeSingle();

    if (error) {
      setLoadFailed(true);
      setLoaded(true);
      logError(
        new Error(error.message),
        { component: 'InviteSettingsPanel', action: 'load-invite-code', sport: 'golf', teamId: activeTeamId },
        'medium'
      );
      return;
    }

    if (team) {
      setTeamId(team.id);
      setInviteCode(team.join_code || '');
    }
    setLoaded(true);
  }, [supabase, activeTeamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const generateNewCode = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      // Server action (same one the Team Info page uses): auth + head-coach
      // ownership check server-side, a crypto-random readable code, uniqueness
      // backed by the golf_teams.join_code UNIQUE constraint, and path
      // revalidation — replaces the old client-side Math.random() update, which
      // was non-cryptographic, unchecked, and could silently collide.
      const result = await regenerateJoinCode(teamId);
      if (!result.success || !result.data) {
        fairwayToast.error(result.error || 'Failed to generate code');
        return;
      }
      setInviteCode(result.data.joinCode);
      fairwayToast.success('New invite code generated');
    } catch (err) {
      fairwayToast.error('Failed to generate code');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'InviteSettingsPanel', action: 'regenerate-invite-code', sport: 'golf', teamId },
        'high'
      );
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/golf/join/${inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      fairwayToast.success('Invite link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      fairwayToast.error('Failed to copy');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'InviteSettingsPanel', action: 'copy-invite-link', sport: 'golf', teamId },
        'medium'
      );
    }
  };

  if (!loaded) {
    return (
      <SectionCard icon={<IconUser size={18} aria-hidden />} title="Invite settings">
        <div role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading invite settings…</span>
          <Skeleton className="h-8 w-full" />
        </div>
      </SectionCard>
    );
  }

  if (loadFailed) {
    return (
      <SectionCard icon={<IconUser size={18} aria-hidden />} title="Invite settings">
        <div className="flex flex-col items-start gap-3">
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Couldn&rsquo;t load your invite settings.
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<IconRefresh size={16} aria-hidden />}
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      </SectionCard>
    );
  }

  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/golf/join/${inviteCode}`;

  return (
    <SectionCard
      icon={<IconUser size={18} aria-hidden />}
      title="Invite settings"
      description="Share the code or link with players to join your team."
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Invite code</FieldLabel>
          <div className="flex gap-2">
            <div className="flex-1 rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 font-fw-mono text-body-lg font-medium text-text-primary">
              {inviteCode || EM_DASH}
            </div>
            <Button
              variant="secondary"
              busy={loading}
              onClick={() => void generateNewCode()}
              aria-label="Regenerate invite code"
            >
              <IconRefresh size={18} aria-hidden />
            </Button>
          </div>
        </div>

        <div>
          <FieldLabel>Invite link</FieldLabel>
          <div className="flex gap-2">
            <div className="flex-1 truncate rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 font-fw-sans text-body-sm text-text-secondary">
              {inviteCode ? inviteUrl : EM_DASH}
            </div>
            <Button
              variant="secondary"
              onClick={() => void copyLink()}
              aria-label={copied ? 'Invite link copied' : 'Copy invite link'}
            >
              {copied ? <IconCheck size={18} aria-hidden /> : <IconCopy size={18} aria-hidden />}
            </Button>
          </div>
        </div>

        <ul className="list-disc space-y-1 rounded-fw-sm bg-surface-sunken p-3 pl-7 font-fw-sans text-caption text-text-secondary">
          <li>Share the code or link with players to join.</li>
          <li>Generate a new code to revoke old invites.</li>
          <li>Players will need coach approval to join.</li>
        </ul>
      </div>
    </SectionCard>
  );
}

export default FairwaySettingsGeneral;
