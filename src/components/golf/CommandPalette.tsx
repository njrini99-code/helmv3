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

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/button';
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
import { useRedesign } from '@/lib/redesign/flag';

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

  // Coach quick-actions (the high-leverage shortcuts the design brief
  // calls out: "Today's calls", "Log a round" — keep as static commands
  // because they're contextless jumps, no DB lookup needed).
  const coachQuickActions: CommandItemSpec[] = [
    // CoachHelm cluster — ONE palette entry per consolidated sub-nav tab (Brief /
    // Signals) instead of repeating a single tab's member routes. The member
    // routes stay searchable via keywords ("today's calls", "patterns",
    // "insights" all resolve to their tab) so nothing becomes unreachable.
    { id: 'intelligence', label: 'CoachHelm AI', description: "Brief — today's calls & command center", icon: <IconBrain size={18} />, href: '/golf/dashboard/intelligence', keywords: ['intelligence', 'ai', 'hub', 'coachhelm', 'overview', 'brief', 'today', "today's calls", 'calls', 'priority', 'commandcenter', 'command center'] },
    { id: 'signals', label: 'CoachHelm Signals', description: 'Alerts, insights & patterns', icon: <IconBell size={18} />, href: '/golf/dashboard/alerts', keywords: ['signals', 'alerts', 'notifications', 'priority', 'attention', 'insights', 'feed', 'recommendations', 'patterns', 'mining', 'evidence', 'triage', 'coachhelm'] },
    { id: 'coachhelm-analytics', label: 'CoachHelm Analytics', description: 'Insight effectiveness', icon: <IconGauge size={18} />, href: '/golf/dashboard/analytics/coachhelm', keywords: ['analytics', 'effectiveness', 'coachhelm', 'metrics'] },
    { id: 'coachhelm-chat', label: 'CoachHelm Chat', description: 'Chat history', icon: <IconBot size={18} />, href: '/golf/dashboard/coachhelm/chat', keywords: ['chat', 'conversation', 'coachhelm', 'history', 'ask'] },
    { id: 'genome-compare', label: 'Genome Compare', description: 'Compare player genomes', icon: <IconChartRadar size={18} />, href: '/golf/dashboard/coachhelm/genome/compare', keywords: ['genome', 'compare', 'radar', 'persona', 'profile'] },
    { id: 'qualifying-selection', label: 'Selection Workspace', description: 'Qualifier selection', icon: <IconCrosshair size={18} />, href: '/golf/dashboard/qualifiers', keywords: ['qualifying', 'selection', 'workspace', 'lineup', 'tournament', 'pick'] },
    { id: 'courses', label: 'Course Library', description: 'Browse courses, tees & saved home courses', icon: <IconMapPin size={18} />, href: '/golf/dashboard/courses', keywords: ['course', 'courses', 'library', 'tees', 'tee', 'facility', 'saved'] },
    { id: 'roster', label: 'Go to Roster', description: 'Manage your team players', icon: <IconUsers size={18} />, href: '/golf/dashboard/roster', keywords: ['players', 'team', 'members'] },
    { id: 'stats', label: 'View Team Stats', description: 'Player performance analytics', icon: <IconChartBar size={18} />, href: '/golf/dashboard/stats', keywords: ['analytics', 'performance', 'scores'] },
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
    { id: 'development', label: 'Development Plans', description: 'Player focus areas', icon: <IconTarget size={18} />, href: '/golf/dashboard/development', keywords: ['focus', 'improvement', 'plan'] },
    { id: 'recruiting', label: 'Recruiting HQ', description: 'Recruiting pipeline', icon: <IconUsers size={18} />, href: '/golf/dashboard/recruiting', keywords: ['recruits', 'pipeline'] },
    { id: 'whats-new', label: "What's New", description: 'Latest team activity', icon: <IconRocket size={18} />, href: '/golf/dashboard/whats-new', keywords: ['whatsnew', 'updates', 'activity', 'changelog', 'recent'] },
    { id: 'coaching-intelligence', label: 'Coaching Intelligence', description: 'Tune your coaching philosophy', icon: <IconWrench size={18} />, href: '/golf/dashboard/settings/coaching-intelligence', keywords: ['philosophy', 'intelligence', 'thresholds', 'sensitivity', 'tuning', 'settings'] },
    { id: 'settings', label: 'Settings', description: 'Account settings', icon: <IconSettings size={18} />, href: '/golf/dashboard/settings', keywords: ['account', 'profile'] },
  ];

  const playerQuickActions: CommandItemSpec[] = [
    { id: 'log-round', label: 'Log a Round', description: 'Start a new round entry', icon: <IconGolf size={18} />, href: '/golf/dashboard/rounds/new', keywords: ['log', 'new', 'submit', 'enter', 'round'] },
    { id: 'insights', label: 'CoachHelm AI', description: 'Personalized AI insights', icon: <IconSparkles size={18} />, href: '/golf/dashboard/coachhelm', keywords: ['ai', 'insights', 'coachhelm', 'focus'] },
    { id: 'rounds', label: 'My Rounds', description: 'View and submit rounds', icon: <IconGolf size={18} />, href: '/golf/dashboard/rounds', keywords: ['scores', 'games'] },
    { id: 'courses', label: 'Course Library', description: 'Browse courses & tee sets', icon: <IconMapPin size={18} />, href: '/golf/dashboard/courses', keywords: ['course', 'courses', 'library', 'tees', 'tee', 'facility'] },
    { id: 'development', label: 'My Development', description: 'Assigned focus areas', icon: <IconTarget size={18} />, href: '/golf/dashboard/my-development', keywords: ['focus', 'improvement', 'plan'] },
    { id: 'qualifiers', label: 'My Qualifiers', description: 'Progress and leaderboards', icon: <IconTrophy size={18} />, href: '/golf/dashboard/my-qualifiers', keywords: ['leaderboard', 'tournament', 'qualifying'] },
    { id: 'stats', label: 'My Stats', description: 'Performance analytics', icon: <IconChartBar size={18} />, href: '/golf/dashboard/stats', keywords: ['analytics', 'performance'] },
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

  // Fairway redesign: the player's Tasks / Announcements / Travel / Classes are
  // consolidated into the Team Hub, so the palette deep-links into the matching
  // sub-tab (and gains a top-level "Team Hub" command) instead of the old
  // scattered routes. Flag OFF → the original entries, unchanged.
  const redesign = useRedesign();
  const playerActions: CommandItemSpec[] = redesign
    ? (() => {
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
      })()
    : playerQuickActions;

  const quickActions = isCoach ? coachQuickActions : playerActions;

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
  // would feel slow; we trade staleness for speed.
  useEffect(() => {
    if (open && !data && !dataLoading) {
      setDataLoading(true);
      getCommandPaletteData()
        .then(setData)
        .catch(() => setData({ players: [], recentRounds: [], recentInsights: [] }))
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
    <div className="fixed inset-0 z-50 animate-in fade-in-0 duration-200" role="dialog" aria-modal="true" aria-label="Command palette">
      {/* Backdrop */}
      <IconButton variant="default"
        type="button"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-warm-900/40 backdrop-blur-md cursor-default"
      ><span className="sr-only">Close command palette</span></IconButton>

      {/* Palette frame */}
      <div className="absolute top-[18%] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] sm:w-full max-w-xl animate-in zoom-in-95 fade-in-0 slide-in-from-top-2 duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]">
        <Command
          label="Command palette"
          loop
          className={cn(
            'overflow-hidden rounded-2xl surface-stone',
            'shadow-[0_4px_18px_hsl(42_14%_22%/0.10),0_28px_60px_hsl(42_14%_22%/0.16)]',
          )}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-warm-200/40">
            <IconSearch size={18} className="text-warm-400" aria-hidden />
            <Command.Input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              placeholder="Search commands…"
              className="flex-1 bg-transparent outline-none text-body text-warm-900 placeholder:text-warm-500 tracking-[-0.005em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 rounded"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
              }}
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-eyebrow font-medium text-warm-500 bg-cream-200/55 rounded-md border border-warm-200/40">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <Command.List className="max-h-[60vh] overflow-y-auto p-2" data-scroll-container>
            <Command.Empty className="text-center py-10 text-body-sm text-warm-500">
              No commands found.
            </Command.Empty>

            {/* Quick actions — static jumps */}
            <Command.Group heading={isCoach ? 'Quick actions' : 'Player'} className="text-warm-500">
              {quickActions.map((cmd) => (
                <Command.Item
                  key={cmd.id}
                  value={`${cmd.label} ${cmd.description ?? ''} ${(cmd.keywords ?? []).join(' ')}`}
                  onSelect={() => {
                    router.push(cmd.href);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer outline-none',
                    'transition-colors duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                    'text-warm-700 data-[selected=true]:bg-primary-50/60 data-[selected=true]:text-primary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cream-200/55 text-warm-700 transition-colors data-[selected=true]:bg-primary-100 data-[selected=true]:text-primary-700">
                    {cmd.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium tracking-[-0.005em] truncate">{cmd.label}</p>
                    {cmd.description && (
                      <p className="text-caption text-warm-500 truncate">{cmd.description}</p>
                    )}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Players (coach only — search by name, jump to player profile) */}
            {isCoach && data && data.players.length > 0 && (
              <Command.Group heading="Players" className="text-warm-500">
                {data.players.map((p) => (
                  <Command.Item
                    key={`player-${p.id}`}
                    value={`Player ${p.full_name} ${p.handicap ?? ''}`}
                    onSelect={() => {
                      router.push(`/golf/dashboard/roster?playerId=${p.id}`);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer outline-none',
                      'transition-colors duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                      'text-warm-700 data-[selected=true]:bg-primary-50/60 data-[selected=true]:text-primary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
                    )}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-200/55 text-warm-700 text-eyebrow font-medium overflow-hidden">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        p.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium tracking-[-0.005em] truncate">{p.full_name}</p>
                      <p className="text-caption text-warm-500 truncate">
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
              <Command.Group heading="Recent insights" className="text-warm-500">
                {data.recentInsights.map((i) => (
                  <Command.Item
                    key={`insight-${i.id}`}
                    value={`Insight ${i.title} ${i.player_name ?? ''} ${i.category ?? ''} ${i.severity ?? ''}`}
                    onSelect={() => {
                      router.push(`/golf/dashboard/insights?id=${i.id}`);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer outline-none',
                      'transition-colors duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                      'text-warm-700 data-[selected=true]:bg-primary-50/60 data-[selected=true]:text-primary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
                    )}
                  >
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                      i.severity === 'urgent' || i.severity === 'high'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-cream-200/55 text-warm-700',
                    )}>
                      {severityIcon(i.severity)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium tracking-[-0.005em] truncate">{i.title}</p>
                      <p className="text-caption text-warm-500 truncate">
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
              <Command.Group heading="Recent rounds" className="text-warm-500">
                {data.recentRounds.map((r) => (
                  <Command.Item
                    key={`round-${r.id}`}
                    value={`Round ${r.course_name ?? ''} ${r.player_name ?? ''} ${r.total_score ?? ''}`}
                    onSelect={() => {
                      router.push(`/golf/dashboard/rounds/${r.id}`);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer outline-none',
                      'transition-colors duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                      'text-warm-700 data-[selected=true]:bg-primary-50/60 data-[selected=true]:text-primary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
                    )}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cream-200/55 text-warm-700">
                      <IconGolf size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium tracking-[-0.005em] truncate">
                        {r.course_name ?? 'Round'}
                        {r.total_score !== null && ` · ${r.total_score}`}
                      </p>
                      <p className="text-caption text-warm-500 truncate">
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
              <div className="text-center py-6 text-caption text-warm-600">
                Loading team data…
              </div>
            )}
          </Command.List>

          {/* Footer hints */}
          <div className="px-4 py-2 border-t border-warm-200/40 flex items-center justify-between text-eyebrow text-warm-500">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-cream-200/55 rounded border border-warm-200/40">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-cream-200/55 rounded border border-warm-200/40">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-cream-200/55 rounded border border-warm-200/40">↵</kbd>
              <span>Select</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}
