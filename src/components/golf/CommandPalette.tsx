'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  IconSearch, IconUsers, IconCalendar, IconChartBar, IconMessage,
  IconSettings, IconGolf, IconFlag, IconBook, IconAirplane, IconSparkles,
  IconTarget, IconTrophy, IconClipboardList, IconBell,
  IconChevronRight
} from '@/components/icons';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isCoach?: boolean;
}

export function CommandPalette({ isCoach = true }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const coachCommands: CommandItem[] = [
    {
      id: 'roster',
      label: 'Go to Roster',
      description: 'Manage your team players',
      icon: <IconUsers size={18} />,
      action: () => router.push('/golf/dashboard/roster'),
      keywords: ['players', 'team', 'members'],
    },
    {
      id: 'stats',
      label: 'View Team Stats',
      description: 'Player performance analytics',
      icon: <IconChartBar size={18} />,
      action: () => router.push('/golf/dashboard/stats'),
      keywords: ['analytics', 'performance', 'scores'],
    },
    {
      id: 'calendar',
      label: 'Open Calendar',
      description: 'Events and schedule',
      icon: <IconCalendar size={18} />,
      action: () => router.push('/golf/dashboard/calendar'),
      keywords: ['schedule', 'events', 'dates'],
    },
    {
      id: 'qualifiers',
      label: 'Manage Qualifiers',
      description: 'Team qualifier rounds',
      icon: <IconFlag size={18} />,
      action: () => router.push('/golf/dashboard/qualifiers'),
      keywords: ['qualifying', 'tryouts'],
    },
    {
      id: 'messages',
      label: 'Messages',
      description: 'Team communication',
      icon: <IconMessage size={18} />,
      action: () => router.push('/golf/dashboard/messages'),
      keywords: ['chat', 'communication'],
    },
    {
      id: 'travel',
      label: 'Travel Plans',
      description: 'Trip itineraries',
      icon: <IconAirplane size={18} />,
      action: () => router.push('/golf/dashboard/travel'),
      keywords: ['trips', 'itinerary'],
    },
    {
      id: 'announcements',
      label: 'Announcements',
      description: 'Team announcements',
      icon: <IconBook size={18} />,
      action: () => router.push('/golf/dashboard/announcements'),
      keywords: ['news', 'updates'],
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Account settings',
      icon: <IconSettings size={18} />,
      action: () => router.push('/golf/dashboard/settings'),
      keywords: ['account', 'profile'],
    },
  ];

  const playerCommands: CommandItem[] = [
    {
      id: 'insights',
      label: 'CoachHelm AI',
      description: 'Personalized AI insights',
      icon: <IconSparkles size={18} />,
      action: () => router.push('/golf/dashboard/coachhelm'),
      keywords: ['ai', 'insights', 'coachhelm', 'focus'],
    },
    {
      id: 'rounds',
      label: 'My Rounds',
      description: 'View and submit rounds',
      icon: <IconGolf size={18} />,
      action: () => router.push('/golf/dashboard/rounds'),
      keywords: ['scores', 'games'],
    },
    {
      id: 'development',
      label: 'My Development',
      description: 'Assigned focus areas',
      icon: <IconTarget size={18} />,
      action: () => router.push('/golf/dashboard/my-development'),
      keywords: ['focus', 'improvement', 'plan'],
    },
    {
      id: 'qualifiers',
      label: 'My Qualifiers',
      description: 'Progress and leaderboards',
      icon: <IconTrophy size={18} />,
      action: () => router.push('/golf/dashboard/my-qualifiers'),
      keywords: ['leaderboard', 'tournament', 'qualifying'],
    },
    {
      id: 'stats',
      label: 'My Stats',
      description: 'Performance analytics',
      icon: <IconChartBar size={18} />,
      action: () => router.push('/golf/dashboard/stats'),
      keywords: ['analytics', 'performance'],
    },
    {
      id: 'calendar',
      label: 'Calendar',
      description: 'Team events',
      icon: <IconCalendar size={18} />,
      action: () => router.push('/golf/dashboard/calendar'),
      keywords: ['schedule', 'events'],
    },
    {
      id: 'messages',
      label: 'Messages',
      description: 'Chat with coaches',
      icon: <IconMessage size={18} />,
      action: () => router.push('/golf/dashboard/messages'),
      keywords: ['chat'],
    },
    {
      id: 'tasks',
      label: 'My Tasks',
      description: 'Pending assignments',
      icon: <IconClipboardList size={18} />,
      action: () => router.push('/golf/dashboard/tasks'),
      keywords: ['assignments', 'todo', 'checklist'],
    },
    {
      id: 'announcements',
      label: 'Announcements',
      description: 'Team updates',
      icon: <IconBell size={18} />,
      action: () => router.push('/golf/dashboard/announcements'),
      keywords: ['news', 'updates', 'notices'],
    },
    {
      id: 'classes',
      label: 'My Classes',
      description: 'Class schedule',
      icon: <IconBook size={18} />,
      action: () => router.push('/golf/dashboard/classes'),
      keywords: ['schedule', 'school'],
    },
    {
      id: 'team',
      label: 'Team Info',
      description: 'Roster and coach details',
      icon: <IconUsers size={18} />,
      action: () => router.push('/golf/dashboard/team'),
      keywords: ['roster', 'team', 'coach'],
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Account settings',
      icon: <IconSettings size={18} />,
      action: () => router.push('/golf/dashboard/settings'),
      keywords: ['account', 'profile'],
    },
  ];

  const commands = isCoach ? coachCommands : playerCommands;

  const filteredCommands = commands.filter((cmd) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.description?.toLowerCase().includes(searchLower) ||
      cmd.keywords?.some((k) => k.toLowerCase().includes(searchLower))
    );
  });

  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setSearch('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Navigate with arrow keys
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
        e.preventDefault();
        filteredCommands[selectedIndex].action();
        setOpen(false);
      }
    },
    [filteredCommands, selectedIndex]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Command palette">
      {/* Enhanced Premium Glass Backdrop */}
      <div
        className="absolute inset-0 bg-warm-900/40 backdrop-blur-md animate-fade-in"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      
      {/* Premium Glass Dialog */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] sm:w-full max-w-lg animate-scale-in">
        <div className={cn(
          'bg-cream-100/68 backdrop-blur-[24px]', // Enhanced glass effect
          'rounded-2xl', // Standardized: 16px
          'shadow-card-hover',
          'border border-warm-200/45',
          'overflow-hidden'
        )}>
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/20 bg-white/30">
            <IconSearch size={20} className="text-warm-400" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search commands..."
              enterKeyHint="go"
              autoComplete="off"
              aria-label="Search commands"
              aria-autocomplete="list"
              aria-controls="command-list"
              aria-activedescendant={filteredCommands[selectedIndex]?.id ? `cmd-${filteredCommands[selectedIndex].id}` : undefined}
              className="flex-1 outline-none text-warm-900 placeholder:text-warm-400 bg-transparent"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-warm-400 bg-cream-100/68 backdrop-blur-sm rounded-lg border border-warm-200/45">
              ESC
            </kbd>
          </div>

          {/* Commands List */}
          <div
            id="command-list"
            role="listbox"
            aria-label="Available commands"
            className="max-h-80 overflow-y-auto p-2" data-scroll-container
          >
            {filteredCommands.length === 0 ? (
              <div className="text-center py-8 text-sm text-warm-500" role="status">
                No commands found
              </div>
            ) : (
              filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.id}
                  id={`cmd-${cmd.id}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => {
                    cmd.action();
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors', // Standardized: 12px
                    index === selectedIndex
                      ? 'bg-primary-50/80 backdrop-blur-sm text-primary-900'
                      : 'hover:bg-white/40 text-warm-700'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center', // Standardized: 12px
                      index === selectedIndex ? 'bg-primary-100' : 'bg-cream-100/68 backdrop-blur-sm'
                    )}
                    aria-hidden="true"
                  >
                    {cmd.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cmd.label}</p>
                    {cmd.description && (
                      <p className="text-xs text-warm-500 truncate">{cmd.description}</p>
                    )}
                  </div>
                  <IconChevronRight size={16} className="text-warm-400" aria-hidden="true" />
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-white/20 bg-white/30 backdrop-blur-sm flex items-center justify-between text-xs text-warm-500">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-cream-100/68 backdrop-blur-sm rounded border border-warm-200/45">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-cream-100/68 backdrop-blur-sm rounded border border-warm-200/45">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-cream-100/68 backdrop-blur-sm rounded border border-warm-200/45">↵</kbd>
              <span>Select</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

