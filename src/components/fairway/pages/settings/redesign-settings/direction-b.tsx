'use client';

// TEMP redesign direction B (removed before ship)

/**
 * Settings, direction B: Workbench.
 *
 * One route, one section at a time, chosen by `?section=<id>` beside
 * `__redesign=b`. Desktop gets a sticky rail whose entries each carry a live
 * one-line status and an unsaved dot; a phone gets a sticky scroll-snapping
 * segmented switcher with the active section's status under it. Every control
 * is an existing settings panel, so every save model is unchanged.
 *
 * Switching sections can never drop an edit: a section mounts the first time
 * it is shown and then stays mounted, only hidden, so its unsaved state lives
 * on while you look elsewhere (the rail's dot says where). Leaving the route,
 * refreshing or closing the tab is still caught by UnsavedChangesGuard, which
 * wraps the whole workbench.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useGolfUser } from '@/contexts/golf-user-context';
import { useGolfTheme } from '@/lib/golf/theme';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { DURATION_MS, EASE, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { Button, EmptyState, ReportProblemButton, Surface, ViewHeader } from '@/components/fairway';
import { IconRefresh } from '@/components/icons';
import { UnsavedChangesGuard } from '@/components/fairway/pages/settings/FairwaySettingsGeneral';
import {
  useSettingsProfile,
  type SettingsProfile,
} from '@/components/fairway/pages/settings/use-settings-profile';
import { resolveSection, sectionsFor, type SectionId } from './b/sections';
import { SectionDirtyScope, useSectionDirtyTracker } from './b/section-dirty-scope';
import { useSectionStatus } from './b/use-section-status';
import { statusLineFor } from './b/status-lines';
import { SectionRail, SectionSummary, SectionSwitcher } from './b/section-nav';
import { SectionPane } from './b/panes';
import { WorkbenchSkeleton } from './b/workbench-skeleton';

const PAGE = 'mx-auto w-full max-w-[1120px] px-4 pb-24 pt-6 md:px-6 md:pt-8';
const GRID = 'lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:items-start lg:gap-10';

export function SettingsDirectionB() {
  const golfUser = useGolfUser();
  const { profile, loadError, loadProfile } = useSettingsProfile();
  // useSettingsProfile never resolves for a player account with no player
  // record (no playerId), which would otherwise be a skeleton forever.
  const missingPlayer = golfUser.role === 'player' && !golfUser.playerId;

  return (
    <div className={PAGE}>
      <ViewHeader
        title="Settings"
        meta={profile ? <ProfileMeta profile={profile} /> : undefined}
      />
      <div className="mt-6 lg:mt-8">
        {profile ? (
          <UnsavedChangesGuard>
            <Workbench profile={profile} loadProfile={loadProfile} />
          </UnsavedChangesGuard>
        ) : loadError ? (
          <LoadFailed onRetry={() => void loadProfile()} />
        ) : missingPlayer ? (
          <EmptyState
            icon={null}
            title={'We couldn’t find your player profile'}
            description="This account signs in as a player but has no player record. Report a problem and we can connect it."
            action={<ReportProblemButton size="sm" />}
          />
        ) : (
          <WorkbenchSkeleton gridClassName={GRID} />
        )}
      </div>
    </div>
  );
}

function ProfileMeta({ profile }: { profile: SettingsProfile }) {
  const team = profile.teamName || profile.currentTeam?.name;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span>{profile.role === 'coach' ? 'Coach' : 'Player'}</span>
      {team ? (
        <>
          <span aria-hidden>{'·'}</span>
          <span className="truncate">{team}</span>
        </>
      ) : null}
    </span>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Surface elevation="border" padding="md" className="flex flex-col items-start gap-3">
      <h2 className="font-fw-sans text-body font-semibold text-text-primary">
        Couldn&rsquo;t load settings
      </h2>
      <p className="font-fw-sans text-body-sm text-text-secondary">
        Something went wrong loading your account. Please try again.
      </p>
      <Button
        variant="primary"
        size="sm"
        leftIcon={<IconRefresh size={16} aria-hidden />}
        onClick={onRetry}
      >
        Retry
      </Button>
    </Surface>
  );
}

function Workbench({
  profile,
  loadProfile,
}: {
  profile: SettingsProfile;
  loadProfile: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotionGuard();
  const { theme } = useGolfTheme();
  const { distancePref } = useDistanceUnits();
  // Both stores hydrate from localStorage in their own mount effects (which
  // run before this one), so after this flips their values are the stored
  // ones, not the defaults.
  const [deviceStoresReady, setDeviceStoresReady] = useState(false);
  useEffect(() => {
    setDeviceStoresReady(true);
  }, []);

  const sections = useMemo(() => sectionsFor(profile), [profile]);
  const urlSection = resolveSection(searchParams.get('section'), sections);

  // router.replace re-requests the route's server payload before the search
  // params update, so the URL alone would make every switch wait on a round
  // trip. The chosen section shows at once and the URL catches up.
  const [pending, setPending] = useState<SectionId | null>(null);
  const active: SectionId =
    pending !== null && sections.some((s) => s.id === pending) ? pending : urlSection;
  useEffect(() => {
    if (pending !== null && pending === urlSection) setPending(null);
  }, [pending, urlSection]);

  const status = useSectionStatus(profile);
  const { refreshTeam, refreshNotifications, setCoachHelmEnabled } = status;

  // An explicit-save Team panel going clean means it saved (or was put back):
  // re-read the row its status line is built from.
  const onPanelSettled = useCallback(
    (section: SectionId, panelId: string) => {
      if (section === 'team' && (panelId === 'golf-scoring' || panelId === 'event-reminders')) {
        void refreshTeam();
      }
    },
    [refreshTeam],
  );
  const { tracker, dirtySections } = useSectionDirtyTracker(onPanelSettled);

  // Sections shown so far stay mounted. The active one is added during render
  // (not only in the effect) so a first visit never paints an empty pane.
  const [visited, setVisited] = useState<ReadonlySet<SectionId>>(() => new Set([active]));
  useEffect(() => {
    setVisited((prev) => (prev.has(active) ? prev : new Set(prev).add(active)));
  }, [active]);

  const hrefFor = useCallback(
    (id: SectionId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('section', id);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams],
  );

  const selectSection = useCallback(
    (id: SectionId) => {
      setPending(id);
      router.replace(hrefFor(id), { scroll: false });
    },
    [router, hrefFor],
  );

  // Rail entries are <Link replace scroll={false}>; the link does the replace.
  const showSection = useCallback((id: SectionId) => setPending(id), []);

  // After a switch, before paint: `scroll: false` keeps the old scroll offset,
  // which can leave you below the end of a shorter section, so bring the
  // pane's top back under the sticky chrome when it has scrolled past; then a
  // short fade on the newly shown pane (skipped under reduced motion).
  const paneRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(active);
  useLayoutEffect(() => {
    if (shownRef.current === active) return;
    shownRef.current = active;
    const container = paneRef.current;
    if (!container) return;
    const margin = Number.parseFloat(getComputedStyle(container).scrollMarginTop) || 0;
    if (container.getBoundingClientRect().top < margin) {
      container.scrollIntoView({ block: 'start' });
    }
    if (!reduceMotion) {
      const pane = container.querySelector<HTMLElement>(`[data-section-pane="${active}"]`);
      pane?.animate?.([{ opacity: 0 }, { opacity: 1 }], {
        duration: DURATION_MS.fast,
        easing: `cubic-bezier(${EASE.soft.join(', ')})`,
      });
    }
  }, [active, reduceMotion]);

  // NotificationsPanel has no change signal: re-read its status on every switch.
  const refreshedForRef = useRef(active);
  useEffect(() => {
    if (refreshedForRef.current === active) return;
    refreshedForRef.current = active;
    void refreshNotifications();
  }, [active, refreshNotifications]);

  const statusInputs = {
    profile,
    team: status.team,
    notifications: status.notifications,
    coachHelm: status.coachHelm,
    theme,
    units: distancePref,
    deviceStoresReady,
  };
  const statusFor = (id: SectionId) => statusLineFor(id, statusInputs);
  const activeDef = sections.find((s) => s.id === active);

  return (
    <div className={GRID}>
      <SectionRail
        className="hidden lg:sticky lg:top-[calc(var(--golf-mobile-header-offset)+1.5rem)] lg:block"
        sections={sections}
        active={active}
        dirty={dirtySections}
        statusFor={statusFor}
        hrefFor={hrefFor}
        onSelect={showSection}
      />

      <div className="min-w-0">
        <SectionSwitcher
          className="lg:hidden"
          sections={sections}
          active={active}
          dirty={dirtySections}
          onSelect={selectSection}
        />

        <div
          ref={paneRef}
          className="scroll-mt-[calc(var(--golf-mobile-header-offset)+4.5rem)] pt-4 lg:scroll-mt-[calc(var(--golf-mobile-header-offset)+1.5rem)] lg:pt-0"
        >
          {activeDef ? (
            <SectionSummary
              className="mb-5 lg:hidden"
              label={activeDef.label}
              status={statusFor(active)}
              dirty={dirtySections.has(active)}
            />
          ) : null}

          {sections.map((section) =>
            section.id === active || visited.has(section.id) ? (
              // `hidden` on a wrapper with no display utility of its own:
              // a `flex` class here would override the attribute.
              <section
                key={section.id}
                aria-label={section.label}
                hidden={section.id !== active}
                data-section-pane={section.id}
              >
                <SectionDirtyScope section={section.id} tracker={tracker}>
                  <div className="flex flex-col gap-7">
                    <SectionPane
                      id={section.id}
                      profile={profile}
                      loadProfile={loadProfile}
                      coachHelm={status.coachHelm}
                      onCoachHelmToggle={setCoachHelmEnabled}
                    />
                  </div>
                </SectionDirtyScope>
              </section>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
