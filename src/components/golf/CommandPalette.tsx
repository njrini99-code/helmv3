'use client';

/**
 * CommandPalette — ⌘K / Ctrl+K command palette.
 *
 * Migrated Apr 2026 from a hand-rolled keyboard-nav implementation
 * to the `cmdk` engine (Linear/Raycast/Vercel). cmdk owns the
 * fuzzy matcher, keyboard navigation (arrows / Home / End / Enter),
 * scroll-into-view of the highlighted item, and the empty state —
 * so we drop ~250 lines of custom logic and inherit the proven
 * Algolia-grade search behavior.
 *
 * The cmdk styles live in globals.css under the `[cmdk-*]` prefix;
 * we only own the chrome (backdrop, dialog frame, footer hints).
 *
 * Visual surface: warm cream glass over a tinted backdrop, matching
 * the rest of the California-modern recipe. Open animation uses the
 * same cubic-bezier(0.16, 1, 0.3, 1) easing as DropdownMenu/Tooltip.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGolfUserOptional } from '@/contexts/golf-user-context';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/button';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import {
  IconSearch, IconUsers, IconCalendar, IconChartBar, IconMessage,
  IconSettings, IconGolf, IconFlag, IconBook, IconAirplane, IconSparkles,
  IconTarget, IconTrophy, IconClipboardList, IconBell, IconAlertCircle,
  IconBrain, IconGauge, IconBot, IconChartRadar, IconCrosshair, IconWrench,
  IconRocket, IconLayoutGrid, IconMapPin,
} from '@/components/icons';
import {
  getCommandPaletteData,
  type CommandPaletteData,
} from '@/app/golf/actions/command-palette';
import { surfaceHref, surfaceName } from '@/lib/golf/surface-registry';

interface CommandItemSpec {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  href: string;
  keywords?: string[];
}

interface CommandPaletteProps {
  isCoach?: boolean;
}

export function CommandPalette({ isCoach = true }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CommandPaletteData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const router = useRouter();
  // OPTIONAL on purpose. This component is rendered without a provider by
  // surface-registry.test.ts, which reads its static command list to prove the
  // palette's labels match the canonical registry — a test that has nothing to
  // do with the signed-in user. Requiring the context here turned that
  // assertion into `useGolfUser must be used within GolfUserProvider`.
  //
  // Outside a provider there is no active team, so the cache below simply never
  // invalidates — which is correct: there is no team to switch away from.
  const teamId = useGolfUserOptional()?.teamId;

  // The session cache below is keyed on the ACTIVE TEAM.
  //
  // Without this, a program head who opened the palette on the men's team and
  // then toggled to the women's kept searching the men's roster, rounds and
  // insights for the rest of the session — with the women's team named in the
  // header above it. Jumping to a player from here would then navigate to
  // someone who is not on the team the coach is looking at.
  const cachedTeamRef = useRef<string | undefined>(teamId);
  if (cachedTeamRef.current !== teamId) {
    cachedTeamRef.current = teamId;
    if (data !== null) setData(null);
  }

  // Coach quick-actions (the high-leverage shortcuts the design brief
  // calls out: "Today's calls", "Log a round" — keep as static commands
  // because they're contextless jumps, no DB lookup needed).
  const coachQuickActions: CommandItemSpec[] = [
    // CoachHelm cluster — ONE palette entry per consolidated sub-nav tab (Brief /
    // Signals) instead of repeating a single tab's member routes. The member
    // routes stay searchable via keywords ("today's calls", "patterns",
    // "insights" all resolve to their tab) so nothing becomes unreachable.
    { id: 'intelligence', label: surfaceName('rail-coachhelm-ai-coach'), description: "Brief — today's calls & command center", icon: <IconBrain size={18} />, href: '/golf/dashboard/intelligence', keywords: ['intelligence', 'ai', 'hub', 'coachhelm', 'overview', 'brief', 'today', "today's calls", 'calls', 'priority', 'commandcenter', 'command center'] },
    { id: 'signals', label: surfaceName('signals'), description: 'Alerts, insights & patterns', icon: <IconBell size={18} />, href: surfaceHref('signals'), keywords: ['signals', 'alerts', 'notifications', 'priority', 'attention', 'insights', 'feed', 'recommendations', 'patterns', 'mining', 'evidence', 'triage', 'coachhelm'] },
    { id: 'coachhelm-insights', label: surfaceName('insights'), description: 'AI-generated coaching insights', icon: <IconSparkles size={18} />, href: surfaceHref('insights'), keywords: ['insights', 'recommendations', 'ai', 'coachhelm', 'signals'] },
    { id: 'coachhelm-patterns', label: surfaceName('patterns'), description: 'Recurring player and team patterns', icon: <IconTarget size={18} />, href: surfaceHref('patterns'), keywords: ['patterns', 'mining', 'trends', 'evidence', 'coachhelm'] },
    { id: 'coachhelm-analytics', label: surfaceName('effectiveness'), description: 'Insight effectiveness', icon: <IconGauge size={18} />, href: surfaceHref('effectiveness'), keywords: ['analytics', 'effectiveness', 'coachhelm', 'metrics'] },
    { id: 'coachhelm-chat', label: surfaceName('ask'), description: 'Chat history', icon: <IconBot size={18} />, href: '/golf/dashboard/coachhelm/chat', keywords: ['chat', 'conversation', 'coachhelm', 'history', 'ask'] },
    { id: 'genome-compare', label: surfaceName('genome-compare'), description: 'Compare player genomes', icon: <IconChartRadar size={18} />, href: '/golf/dashboard/coachhelm/genome/compare', keywords: ['genome', 'compare', 'radar', 'persona', 'profile'] },
    { id: 'qualifying-selection', label: 'Selection Workspace', description: 'Qualifier selection', icon: <IconCrosshair size={18} />, href: '/golf/dashboard/qualifiers', keywords: ['qualifying', 'selection', 'workspace', 'lineup', 'tournament', 'pick'] },
    { id: 'courses', label: 'Course Library', description: 'Browse courses, tees & saved home courses', icon: <IconMapPin size={18} />, href: '/golf/dashboard/courses', keywords: ['course', 'courses', 'library', 'tees', 'tee', 'facility', 'saved'] },
    { id: 'roster', label: 'Go to Roster', description: 'Manage your team players', icon: <IconUsers size={18} />, href: '/golf/dashboard/roster', keywords: ['players', 'team', 'members'] },
    { id: 'stats', label: surfaceName('stats'), description: 'Player performance analytics', icon: <IconChartBar size={18} />, href: '/golf/dashboard/stats', keywords: ['analytics', 'performance', 'scores'] },
    { id: 'stats-team', label: 'Team Stats Board', description: 'Roster-wide stat comparison', icon: <IconChartBar size={18} />, href: '/golf/dashboard/stats/team', keywords: ['team', 'stats', 'leaderboard', 'comparison', 'roster'] },
    { id: 'calendar', label: 'Open Calendar', description: 'Events and schedule', icon: <IconCalendar size={18} />, href: '/golf/dashboard/calendar', keywords: ['schedule', 'events', 'dates'] },
    { id: 'qualifiers', label: 'Manage Qualifiers', description: 'Team qualifier rounds', icon: <IconFlag size={18} />, href: '/golf/dashboard/qualifiers', keywords: ['qualifying', 'tryouts'] },
    { id: 'messages', label: 'Messages', description: 'Team communication', icon: <IconMessage size={18} />, href: '/golf/dashboard/messages', keywords: ['chat', 'communication'] },
    { id: 'travel', label: 'Travel Plans', description: 'Trip itineraries', icon: <IconAirplane size={18} />, href: '/golf/dashboard/travel', keywords: ['trips', 'itinerary'] },
    { id: 'announcements', label: 'Announcements', description: 'Team announcements', icon: <IconBook size={18} />, href: '/golf/dashboard/announcements', keywords: ['news', 'updates'] },
    // Moved out of the sidebar in the 2026-05-28 IA trim — reachable here +
    // via direct URL. Add icons later if a palette redesign asks for it.
    { id: 'documents', label: 'Documents', description: 'Team files and forms', icon: <IconBook size={18} />, href: '/golf/dashboard/documents', keywords: ['files', 'forms', 'pdfs'] },
    { id: 'tasks', label: 'Tasks', description: 'Open and assigned tasks', icon: <IconClipboardList size={18} />, href: '/golf/dashboard/tasks', keywords: ['todo', 'assignments', 'checklist'] },
    { id: 'development', label: surfaceName('development'), description: 'Player focus areas', icon: <IconTarget size={18} />, href: surfaceHref('development'), keywords: ['focus', 'improvement', 'plan'] },
    { id: 'recruiting', label: 'Recruiting HQ', description: 'Recruiting pipeline', icon: <IconUsers size={18} />, href: '/golf/dashboard/recruiting', keywords: ['recruits', 'pipeline'] },
    { id: 'whats-new', label: "What's New", description: 'Latest team activity', icon: <IconRocket size={18} />, href: '/golf/dashboard/whats-new', keywords: ['whatsnew', 'updates', 'activity', 'changelog', 'recent'] },
    { id: 'coaching-intelligence', label: 'Coaching Intelligence', description: 'Tune your coaching philosophy', icon: <IconWrench size={18} />, href: '/golf/dashboard/settings/coaching-intelligence', keywords: ['philosophy', 'intelligence', 'thresholds', 'sensitivity', 'tuning', 'settings'] },
    { id: 'settings', label: 'Settings', description: 'Account settings', icon: <IconSettings size={18} />, href: '/golf/dashboard/settings', keywords: ['account', 'profile'] },
  ];

  const playerQuickActions: CommandItemSpec[] = [
    { id: 'log-round', label: 'Log a Round', description: 'Start a new round entry', icon: <IconGolf size={18} />, href: '/golf/dashboard/rounds/new', keywords: ['log', 'new', 'submit', 'enter', 'round'] },
    { id: 'insights', label: surfaceName('rail-coachhelm-ai-player'), description: 'Personalized AI insights', icon: <IconSparkles size={18} />, href: '/golf/dashboard/coachhelm', keywords: ['ai', 'insights', 'coachhelm', 'focus'] },
    { id: 'rounds', label: 'My Rounds', description: 'View and submit rounds', icon: <IconGolf size={18} />, href: '/golf/dashboard/rounds', keywords: ['scores', 'games'] },
    { id: 'courses', label: 'Course Library', description: 'Browse courses & tee sets', icon: <IconMapPin size={18} />, href: '/golf/dashboard/courses', keywords: ['course', 'courses', 'library', 'tees', 'tee', 'facility'] },
    { id: 'development', label: surfaceName('my-development-tab'), description: 'Assigned focus areas', icon: <IconTarget size={18} />, href: surfaceHref('my-development-tab'), keywords: ['focus', 'improvement', 'plan'] },
    { id: 'qualifiers', label: 'My Qualifiers', description: 'Progress and leaderboards', icon: <IconTrophy size={18} />, href: '/golf/dashboard/my-qualifiers', keywords: ['leaderboard', 'tournament', 'qualifying'] },
    { id: 'stats', label: surfaceName('rail-my-stats-player'), description: 'Performance analytics', icon: <IconChartBar size={18} />, href: '/golf/dashboard/stats', keywords: ['analytics', 'performance'] },
    { id: 'calendar', label: 'Calendar', description: 'Team events', icon: <IconCalendar size={18} />, href: '/golf/dashboard/calendar', keywords: ['schedule', 'events'] },
    { id: 'messages', label: 'Messages', description: 'Chat with coaches', icon: <IconMessage size={18} />, href: '/golf/dashboard/messages', keywords: ['chat'] },
    { id: 'tasks', label: 'My Tasks', description: 'Pending assignments', icon: <IconClipboardList size={18} />, href: '/golf/dashboard/tasks', keywords: ['assignments', 'todo', 'checklist'] },
    { id: 'announcements', label: 'Announcements', description: 'Team updates', icon: <IconBell size={18} />, href: '/golf/dashboard/announcements', keywords: ['news', 'updates', 'notices'] },
    { id: 'classes', label: 'My Classes', description: 'Class schedule', icon: <IconBook size={18} />, href: '/golf/dashboard/classes', keywords: ['schedule', 'school'] },
    { id: 'team', label: 'Team Info', description: 'Roster and coach details', icon: <IconUsers size={18} />, href: '/golf/dashboard/team', keywords: ['roster', 'team', 'coach'] },
    // Moved out of the player sidebar in the 2026-05-28 IA trim — palette + URL only.
    { id: 'travel', label: 'Travel', description: 'Team trip itineraries', icon: <IconAirplane size={18} />, href: '/golf/dashboard/travel', keywords: ['trips', 'itinerary'] },
    { id: 'notifications', label: 'Notification Preferences', description: 'Per-category notification settings', icon: <IconBell size={18} />, href: '/golf/dashboard/settings/notifications', keywords: ['notifications', 'preferences', 'alerts', 'quiet', 'settings'] },
    { id: 'settings', label: 'Settings', description: 'Account settings', icon: <IconSettings size={18} />, href: '/golf/dashboard/settings', keywords: ['account', 'profile'] },
  ];

  // The player's Tasks / Announcements / Travel / Classes are consolidated
  // into the Team Hub, so the palette deep-links into the matching sub-tab
  // (and gains a top-level "Team Hub" command) instead of the old scattered
  // routes.
  const playerActions: CommandItemSpec[] = (() => {
    const TAB_FOR_ID: Record<string, 'tasks' | 'announcements' | 'travel' | 'classes'> = {
      tasks: 'tasks',
      announcements: 'announcements',
      travel: 'travel',
      classes: 'classes',
    };
    const remapped = playerQuickActions.map((a) => {
      const tab = TAB_FOR_ID[a.id];
      return tab ? { ...a, href: `/golf/dashboard/team-hub?tab=${tab}` } : a;
    });
    const teamHubEntry: CommandItemSpec = {
      id: 'team-hub',
      label: 'Team Hub',
      description: 'Tasks, announcements, travel & your classes',
      icon: <IconLayoutGrid size={18} />,
      href: '/golf/dashboard/team-hub',
      keywords: ['team', 'hub', 'tasks', 'announcements', 'travel', 'classes', 'updates'],
    };
    return [teamHubEntry, ...remapped];
  })();

  const quickActions = isCoach ? coachQuickActions : playerActions;

  // Shared hand-rolled-dialog primitive (already proven in ConfirmDialog /
  // JoinRequestsModal / EventDetailModal): Tab focus trap + focus restore to
  // whatever triggered the palette + Escape-to-close, scoped to `modalRef`
  // below. cmdk itself owns only the fuzzy matcher/keyboard nav, not modal
  // semantics, so without this Tab could escape to background controls and
  // focus was never returned to the ⌘K trigger on close (#a11y-sweep P1).
  const handleClose = useCallback(() => setOpen(false), []);
  const { modalRef } = useFocusTrap(open, handleClose);

  // ⌘K / Ctrl+K toggles the palette globally
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Additive imperative open — lets a click target (e.g. the Fairway shell's
  // glass-topbar ⌘K button) open the palette without faking a keystroke, which
  // is unreliable inside the iOS WKWebView. Inert unless the event is fired, so
  // the flag-off legacy app behaves identically.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('helm:open-command-palette', onOpen);
    return () => window.removeEventListener('helm:open-command-palette', onOpen);
  }, []);

  // Lazy-fetch dynamic data on first open. Cached for the session — the
  // bundle is small enough (~60 players + 10 rounds + 10 insights) that
  // a single fetch covers any reasonable session. Re-fetch on every open
  // would feel slow; we trade staleness for speed. The cache is dropped on a
  // team change (above), which is the one staleness that is not acceptable:
  // it would search the other squad.
  useEffect(() => {
    if (open && !data && !dataLoading) {
      setDataLoading(true);
      getCommandPaletteData()
        .then(setData)
        .catch((error: unknown) => {
          // An empty palette is indistinguishable from a team with nobody on
          // it. Say so rather than presenting the failure as a finding.
          console.warn('[command palette] data fetch failed:', error);
          setData({ players: [], recentRounds: [], recentInsights: [] });
        })
        .finally(() => setDataLoading(false));
    }
  }, [open, data, dataLoading]);

  if (!open) return null;

  const formatRoundDate = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const severityIcon = (sev: string | null) => {
    if (sev === 'urgent' || sev === 'high') return <IconAlertCircle size={18} />;
    return <IconSparkles size={18} />;
  };

  return (
    <div className="fixed inset-0 z-50 animate-in fade-in-0 duration-200">
      {/* Backdrop */}
      <IconButton variant="default"
        type="button"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-[oklch(0.18_0.01_55_/_0.32)] backdrop-blur-md cursor-default"
      ><span className="sr-only">Close command palette</span></IconButton>

      {/* Palette frame */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="absolute top-[18%] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] sm:w-full max-w-xl animate-in zoom-in-95 fade-in-0 slide-in-from-top-2 duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
      >
        <Command
          label="Command palette"
          loop
          className={cn(
            'overflow-hidden rounded-fw-lg bg-surface border border-border-subtle',
            'shadow-raise',
          )}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
            <IconSearch size={18} className="text-text-tertiary" aria-hidden />
            <Command.Input
              placeholder="Search commands…"
              className="flex-1 bg-transparent outline-none font-fw-sans text-body text-text-primary placeholder:text-text-tertiary tracking-[-0.005em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-eyebrow font-fw-mono font-medium text-text-tertiary bg-surface rounded-fw-sm border border-border-subtle">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="max-h-[60vh] overflow-y-auto p-2" data-scroll-container>
            <Command.Empty className="text-center py-10 text-body-sm text-text-tertiary">
              No commands found.
            </Command.Empty>

            {/* Quick actions — static jumps */}
            <Command.Group heading={isCoach ? 'Quick actions' : 'Player'} className="text-text-tertiary">
              {quickActions.map((cmd) => (
                <Command.Item
                  key={cmd.id}
                  value={`${cmd.label} ${cmd.description ?? ''} ${(cmd.keywords ?? []).join(' ')}`}
                  onSelect={() => {
                    router.push(cmd.href);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-fw-md cursor-pointer outline-none',
                    'transition-colors duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                    'text-text-secondary data-[selected=true]:bg-accent-50 data-[selected=true]:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-fw-sm bg-inset text-text-secondary transition-colors data-[selected=true]:bg-accent-100 data-[selected=true]:text-accent-700">
                    {cmd.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium tracking-[-0.005em] truncate">{cmd.label}</p>
                    {cmd.description && (
                      <p className="text-caption text-text-tertiary truncate">{cmd.description}</p>
                    )}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Players (coach only — search by name, jump to player profile) */}
            {isCoach && data && data.players.length > 0 && (
              <Command.Group heading="Players" className="text-text-tertiary">
                {data.players.map((p) => (
                  <Command.Item
                    key={`player-${p.id}`}
                    value={`Player ${p.full_name} ${p.handicap ?? ''}`}
                    onSelect={() => {
                      // Land on the real per-player surface, NOT the unfiltered
                      // roster. The roster route does not consume ?playerId=
                      // (the param was silently dropped); the Scouting Report
                      // tab of /players/[playerId]/game is the id-aware
                      // destination the roster card's own "View Player" CTA
                      // links to. The palette result now reaches the targeted
                      // player. (Premium hard-gate B1.) GOLF IA REORG
                      // (final_migrations #11): canonical URL updated.
                      router.push(`/golf/dashboard/players/${p.id}/game?tab=scouting`);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-fw-md cursor-pointer outline-none',
                      'transition-colors duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                      'text-text-secondary data-[selected=true]:bg-accent-50 data-[selected=true]:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    )}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-inset text-text-secondary text-eyebrow font-medium overflow-hidden">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        p.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium tracking-[-0.005em] truncate">{p.full_name}</p>
                      <p className="text-caption text-text-tertiary truncate">
                        {p.status ?? 'Player'}
                        {p.handicap !== null && ` · HCP ${p.handicap}`}
                      </p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Recent insights (coach only — jump to insight detail) */}
            {isCoach && data && data.recentInsights.length > 0 && (
              <Command.Group heading="Recent insights" className="text-text-tertiary">
                {data.recentInsights.map((i) => (
                  <Command.Item
                    key={`insight-${i.id}`}
                    value={`Insight ${i.title} ${i.player_name ?? ''} ${i.category ?? ''} ${i.severity ?? ''}`}
                    onSelect={() => {
                      router.push(`${surfaceHref('insights')}&id=${i.id}`);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-fw-md cursor-pointer outline-none',
                      'transition-colors duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                      'text-text-secondary data-[selected=true]:bg-accent-50 data-[selected=true]:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    )}
                  >
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-fw-sm transition-colors',
                      i.severity === 'urgent' || i.severity === 'high'
                        ? 'bg-fw-danger-bg text-fw-danger-ink'
                        : 'bg-inset text-text-secondary',
                    )}>
                      {severityIcon(i.severity)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium tracking-[-0.005em] truncate">{i.title}</p>
                      <p className="text-caption text-text-tertiary truncate">
                        {i.player_name ? `${i.player_name} · ` : ''}
                        {i.category ?? 'Insight'}
                      </p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Recent rounds — jump to review */}
            {data && data.recentRounds.length > 0 && (
              <Command.Group heading="Recent rounds" className="text-text-tertiary">
                {data.recentRounds.map((r) => (
                  <Command.Item
                    key={`round-${r.id}`}
                    value={`Round ${r.course_name ?? ''} ${r.player_name ?? ''} ${r.total_score ?? ''}`}
                    onSelect={() => {
                      router.push(`/golf/dashboard/rounds/${r.id}`);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-fw-md cursor-pointer outline-none',
                      'transition-colors duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                      'text-text-secondary data-[selected=true]:bg-accent-50 data-[selected=true]:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    )}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-fw-sm bg-inset text-text-secondary">
                      <IconGolf size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium tracking-[-0.005em] truncate">
                        {r.course_name ?? 'Round'}
                        {r.total_score !== null && ` · ${r.total_score}`}
                      </p>
                      <p className="text-caption text-text-tertiary truncate">
                        {isCoach && r.player_name ? `${r.player_name} · ` : ''}
                        {formatRoundDate(r.round_date)}
                      </p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Loading hint on first open */}
            {dataLoading && !data && (
              <div className="text-center py-6 text-caption text-text-tertiary">
                Loading team data…
              </div>
            )}
          </Command.List>

          {/* Footer hints */}
          <div className="px-4 py-2 border-t border-border-subtle flex items-center justify-between text-eyebrow text-text-tertiary">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 font-fw-mono bg-surface rounded-fw-sm border border-border-subtle">↑</kbd>
              <kbd className="px-1.5 py-0.5 font-fw-mono bg-surface rounded-fw-sm border border-border-subtle">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 font-fw-mono bg-surface rounded-fw-sm border border-border-subtle">↵</kbd>
              <span>Select</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}
