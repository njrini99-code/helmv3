'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  IconSearch, IconUsers, IconCalendar, IconChart, IconMessage, 
  IconSettings, IconGolf, IconFlag, IconBook, IconAirplane,
  IconChevronRight, IconX
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
      icon: <IconChart size={18} />,
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
      id: 'rounds',
      label: 'My Rounds',
      description: 'View and submit rounds',
      icon: <IconGolf size={18} />,
      action: () => router.push('/golf/dashboard/rounds'),
      keywords: ['scores', 'games'],
    },
    {
      id: 'stats',
      label: 'My Stats',
      description: 'Performance analytics',
      icon: <IconChart size={18} />,
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
      id: 'classes',
      label: 'My Classes',
      description: 'Class schedule',
      icon: <IconBook size={18} />,
      action: () => router.push('/golf/dashboard/classes'),
      keywords: ['schedule', 'school'],
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
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
        onClick={() => setOpen(false)}
      />
      
      {/* Dialog */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg animate-scale-in">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <IconSearch size={20} className="text-slate-400" />
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
              className="flex-1 outline-none text-slate-900 placeholder:text-slate-400"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 bg-slate-100 rounded">
              ESC
            </kbd>
          </div>

          {/* Commands List */}
          <div className="max-h-80 overflow-y-auto p-2">
            {filteredCommands.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No commands found
              </div>
            ) : (
              filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                    index === selectedIndex
                      ? 'bg-green-50 text-green-900'
                      : 'hover:bg-slate-50 text-slate-700'
                  )}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    index === selectedIndex ? 'bg-green-100' : 'bg-slate-100'
                  )}>
                    {cmd.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{cmd.label}</p>
                    {cmd.description && (
                      <p className="text-sm text-slate-500 truncate">{cmd.description}</p>
                    )}
                  </div>
                  <IconChevronRight size={16} className="text-slate-400" />
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-white rounded border">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white rounded border">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-white rounded border">↵</kbd>
              <span>Select</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Trigger button to show in UI
export function CommandPaletteTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <button
      onClick={() => {
        // Dispatch a keyboard event to open the palette
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
      }}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
    >
      <IconSearch size={14} />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden sm:inline text-xs text-slate-400 ml-2">⌘K</kbd>
    </button>
  );
}
