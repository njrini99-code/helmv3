'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  IconSearch, IconUsers, IconCalendar, IconChart, IconMessage,
  IconSettings, IconTarget, IconChevronRight
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
      action: () => router.push('/baseball/dashboard/roster'),
      keywords: ['players', 'team', 'members'],
    },
    {
      id: 'pipeline',
      label: 'Recruiting Pipeline',
      description: 'Manage recruiting prospects',
      icon: <IconTarget size={18} />,
      action: () => router.push('/baseball/dashboard/pipeline'),
      keywords: ['recruits', 'prospects'],
    },
    {
      id: 'discover',
      label: 'Discover Players',
      description: 'Find new recruits',
      icon: <IconSearch size={18} />,
      action: () => router.push('/baseball/dashboard/discover'),
      keywords: ['search', 'find', 'recruits'],
    },
    {
      id: 'stats',
      label: 'View Team Stats',
      description: 'Player performance analytics',
      icon: <IconChart size={18} />,
      action: () => router.push('/baseball/dashboard/stats'),
      keywords: ['analytics', 'performance', 'scores'],
    },
    {
      id: 'calendar',
      label: 'Open Calendar',
      description: 'Events and schedule',
      icon: <IconCalendar size={18} />,
      action: () => router.push('/baseball/dashboard/calendar'),
      keywords: ['schedule', 'events', 'dates'],
    },
    {
      id: 'messages',
      label: 'Messages',
      description: 'Team communication',
      icon: <IconMessage size={18} />,
      action: () => router.push('/baseball/dashboard/messages'),
      keywords: ['chat', 'communication'],
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Account settings',
      icon: <IconSettings size={18} />,
      action: () => router.push('/baseball/dashboard/settings'),
      keywords: ['account', 'profile'],
    },
  ];

  const playerCommands: CommandItem[] = [
    {
      id: 'profile',
      label: 'My Profile',
      description: 'View and edit your profile',
      icon: <IconTarget size={18} />,
      action: () => router.push('/baseball/dashboard/profile'),
      keywords: ['me', 'info'],
    },
    {
      id: 'stats',
      label: 'My Stats',
      description: 'Performance analytics',
      icon: <IconChart size={18} />,
      action: () => router.push('/baseball/dashboard/stats'),
      keywords: ['analytics', 'performance'],
    },
    {
      id: 'calendar',
      label: 'Calendar',
      description: 'Team events',
      icon: <IconCalendar size={18} />,
      action: () => router.push('/baseball/dashboard/calendar'),
      keywords: ['schedule', 'events'],
    },
    {
      id: 'messages',
      label: 'Messages',
      description: 'Chat with coaches',
      icon: <IconMessage size={18} />,
      action: () => router.push('/baseball/dashboard/messages'),
      keywords: ['chat'],
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Account settings',
      icon: <IconSettings size={18} />,
      action: () => router.push('/baseball/dashboard/settings'),
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md animate-fade-in"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg animate-scale-in">
        <div className={cn(
          'bg-white/60 backdrop-blur-[24px]',
          'rounded-2xl',
          'shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.5)]',
          'border border-white/30',
          'overflow-hidden'
        )}>
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/20 bg-white/30">
            <IconSearch size={20} className="text-slate-400" aria-hidden="true" />
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
              aria-label="Search commands"
              className="flex-1 outline-none text-slate-900 placeholder:text-slate-400 bg-transparent"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 bg-white/60 backdrop-blur-sm rounded-lg border border-white/30">
              ESC
            </kbd>
          </div>

          {/* Commands List */}
          <div
            id="command-list"
            role="listbox"
            aria-label="Available commands"
            className="max-h-80 overflow-y-auto p-2"
          >
            {filteredCommands.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500" role="status">
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
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                    index === selectedIndex
                      ? 'bg-primary-50/80 backdrop-blur-sm text-primary-900'
                      : 'hover:bg-white/40 text-slate-700'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      index === selectedIndex ? 'bg-primary-100' : 'bg-white/60 backdrop-blur-sm'
                    )}
                    aria-hidden="true"
                  >
                    {cmd.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cmd.label}</p>
                    {cmd.description && (
                      <p className="text-xs text-slate-500 truncate">{cmd.description}</p>
                    )}
                  </div>
                  <IconChevronRight size={16} className="text-slate-400" aria-hidden="true" />
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-white/20 bg-white/30 backdrop-blur-sm flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-white/60 backdrop-blur-sm rounded border border-white/30">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white/60 backdrop-blur-sm rounded border border-white/30">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-white/60 backdrop-blur-sm rounded border border-white/30">↵</kbd>
              <span>Select</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
