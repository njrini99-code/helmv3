'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { getFullName } from '@/lib/utils';
import {
  IconSearch,
  IconHome,
  IconUsers,
  IconUser,
  IconMessage,
  IconSettings,
  IconCalendar,
  IconVideo,
  IconChart,
  IconTarget,
  IconStar,
  IconLogOut,
  IconClock,
  IconArrowRight,
  IconBuilding,
} from '@/components/icons';
interface PlayerSearchResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  grad_year: number | null;
  high_school_name: string | null;
  avatar_url: string | null;
}

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  section: 'recent' | 'navigation' | 'players' | 'actions';
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<PlayerSearchResult[]>([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Toggle command palette with Cmd+K (Mac) / Ctrl+K (Windows)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open]);

  // Search players when search query changes
  useEffect(() => {
    const searchPlayers = async () => {
      if (search.length < 2) {
        setPlayers([]);
        return;
      }

      setSearchingPlayers(true);
      const { data } = await supabase
        .from('players')
        .select('id, first_name, last_name, primary_position, grad_year, high_school_name, avatar_url')
        .eq('recruiting_activated', true)
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,high_school_name.ilike.%${search}%`)
        .limit(5);

      setPlayers(data || []);
      setSearchingPlayers(false);
    };

    const debounce = setTimeout(searchPlayers, 200);
    return () => clearTimeout(debounce);
  }, [search]);

  // Reset search when closed
  useEffect(() => {
    if (!open) {
      setSearch('');
      setPlayers([]);
    }
  }, [open]);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  // Define all command items
  const items: CommandItem[] = [
    // Recent (would be dynamic in production)
    {
      id: 'recent-discover',
      label: 'Discover Players',
      icon: <IconUsers size={18} />,
      section: 'recent',
      action: () => router.push('/dashboard/discover'),
    },
    {
      id: 'recent-watchlist',
      label: 'My Watchlist',
      icon: <IconStar size={18} />,
      section: 'recent',
      action: () => router.push('/dashboard/watchlist'),
    },
    // Navigation
    {
      id: 'nav-dashboard',
      label: 'Dashboard',
      icon: <IconHome size={18} />,
      shortcut: 'G D',
      section: 'navigation',
      action: () => router.push('/dashboard'),
    },
    {
      id: 'nav-discover',
      label: 'Discover',
      icon: <IconUsers size={18} />,
      shortcut: 'G F',
      section: 'navigation',
      action: () => router.push('/dashboard/discover'),
    },
    {
      id: 'nav-watchlist',
      label: 'Watchlist',
      icon: <IconStar size={18} />,
      shortcut: 'G W',
      section: 'navigation',
      action: () => router.push('/dashboard/watchlist'),
    },
    {
      id: 'nav-pipeline',
      label: 'Pipeline',
      icon: <IconTarget size={18} />,
      shortcut: 'G P',
      section: 'navigation',
      action: () => router.push('/dashboard/pipeline'),
    },
    {
      id: 'nav-messages',
      label: 'Messages',
      icon: <IconMessage size={18} />,
      shortcut: 'G M',
      section: 'navigation',
      action: () => router.push('/dashboard/messages'),
    },
    {
      id: 'nav-calendar',
      label: 'Calendar',
      icon: <IconCalendar size={18} />,
      shortcut: 'G C',
      section: 'navigation',
      action: () => router.push('/dashboard/calendar'),
    },
    {
      id: 'nav-videos',
      label: 'Video Library',
      icon: <IconVideo size={18} />,
      section: 'navigation',
      action: () => router.push('/dashboard/videos'),
    },
    {
      id: 'nav-analytics',
      label: 'Analytics',
      icon: <IconChart size={18} />,
      section: 'navigation',
      action: () => router.push('/dashboard/analytics'),
    },
    {
      id: 'nav-program',
      label: 'Program Profile',
      icon: <IconBuilding size={18} />,
      section: 'navigation',
      action: () => router.push('/dashboard/program'),
    },
    {
      id: 'nav-settings',
      label: 'Settings',
      icon: <IconSettings size={18} />,
      shortcut: 'G S',
      section: 'navigation',
      action: () => router.push('/dashboard/settings'),
    },
    // Actions
    {
      id: 'action-new-message',
      label: 'New Message',
      icon: <IconMessage size={18} />,
      shortcut: 'N M',
      section: 'actions',
      action: () => router.push('/dashboard/messages?compose=true'),
    },
    {
      id: 'action-profile',
      label: 'Edit Profile',
      icon: <IconUser size={18} />,
      section: 'actions',
      action: () => router.push('/dashboard/profile'),
    },
    {
      id: 'action-logout',
      label: 'Log Out',
      icon: <IconLogOut size={18} />,
      section: 'actions',
      action: () => router.push('/logout'),
    },
  ];

  const filteredItems = items.filter((item) =>
    item.label.toLowerCase().includes(search.toLowerCase())
  );

  const recentItems = filteredItems.filter((item) => item.section === 'recent');
  const navigationItems = filteredItems.filter((item) => item.section === 'navigation');
  const actionItems = filteredItems.filter((item) => item.section === 'actions');

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk-dialog" onClick={(e) => e.stopPropagation()}>
        <Command shouldFilter={false} className="cmdk-root">
          {/* Search Input */}
          <div className="cmdk-input-wrapper">
            <IconSearch size={18} className="text-slate-400" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search commands..."
              className="cmdk-input"
              autoFocus
            />
            <kbd className="kbd">ESC</kbd>
          </div>

          {/* Command List */}
          <Command.List className="cmdk-list">
            {filteredItems.length === 0 && players.length === 0 && !searchingPlayers && (
              <Command.Empty className="cmdk-empty">
                No results found.
              </Command.Empty>
            )}

            {/* Players Section */}
            {(players.length > 0 || searchingPlayers) && search.length >= 2 && (
              <Command.Group heading="Players" className="cmdk-group">
                <div className="cmdk-group-heading">
                  <IconUsers size={14} />
                  <span>Players</span>
                </div>
                {searchingPlayers ? (
                  <div className="cmdk-item px-3 py-2 text-sm text-slate-500">
                    Searching players...
                  </div>
                ) : (
                  players.map((player) => {
                    const name = getFullName(player.first_name, player.last_name);
                    return (
                      <Command.Item
                        key={player.id}
                        value={`player-${player.id}`}
                        onSelect={() => runCommand(() => router.push(`/dashboard/players/${player.id}`))}
                        className="cmdk-item"
                      >
                        <div className="cmdk-item-content">
                          <Avatar name={name} src={player.avatar_url} size="xs" />
                          <div className="flex flex-col ml-1">
                            <span className="cmdk-item-label">{name}</span>
                            <span className="text-xs text-slate-500">
                              {player.primary_position} • {player.grad_year} • {player.high_school_name}
                            </span>
                          </div>
                        </div>
                        <IconArrowRight size={14} className="cmdk-item-arrow" />
                      </Command.Item>
                    );
                  })
                )}
              </Command.Group>
            )}

            {/* Recent Section */}
            {recentItems.length > 0 && (
              <Command.Group heading="Recent" className="cmdk-group">
                <div className="cmdk-group-heading">
                  <IconClock size={14} />
                  <span>Recent</span>
                </div>
                {recentItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.label}
                    onSelect={() => runCommand(item.action)}
                    className="cmdk-item"
                  >
                    <div className="cmdk-item-content">
                      <span className="cmdk-item-icon">{item.icon}</span>
                      <span className="cmdk-item-label">{item.label}</span>
                    </div>
                    {item.shortcut && (
                      <div className="cmdk-item-shortcut">
                        {item.shortcut.split(' ').map((key, i) => (
                          <kbd key={i} className="kbd">{key}</kbd>
                        ))}
                      </div>
                    )}
                    <IconArrowRight size={14} className="cmdk-item-arrow" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Navigation Section */}
            {navigationItems.length > 0 && (
              <Command.Group heading="Navigation" className="cmdk-group">
                <div className="cmdk-group-heading">
                  <IconHome size={14} />
                  <span>Navigation</span>
                </div>
                {navigationItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.label}
                    onSelect={() => runCommand(item.action)}
                    className="cmdk-item"
                  >
                    <div className="cmdk-item-content">
                      <span className="cmdk-item-icon">{item.icon}</span>
                      <span className="cmdk-item-label">{item.label}</span>
                    </div>
                    {item.shortcut && (
                      <div className="cmdk-item-shortcut">
                        {item.shortcut.split(' ').map((key, i) => (
                          <kbd key={i} className="kbd">{key}</kbd>
                        ))}
                      </div>
                    )}
                    <IconArrowRight size={14} className="cmdk-item-arrow" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Actions Section */}
            {actionItems.length > 0 && (
              <Command.Group heading="Actions" className="cmdk-group">
                <div className="cmdk-group-heading">
                  <IconTarget size={14} />
                  <span>Actions</span>
                </div>
                {actionItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.label}
                    onSelect={() => runCommand(item.action)}
                    className="cmdk-item"
                  >
                    <div className="cmdk-item-content">
                      <span className="cmdk-item-icon">{item.icon}</span>
                      <span className="cmdk-item-label">{item.label}</span>
                    </div>
                    {item.shortcut && (
                      <div className="cmdk-item-shortcut">
                        {item.shortcut.split(' ').map((key, i) => (
                          <kbd key={i} className="kbd">{key}</kbd>
                        ))}
                      </div>
                    )}
                    <IconArrowRight size={14} className="cmdk-item-arrow" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer */}
          <div className="cmdk-footer">
            <div className="cmdk-footer-hint">
              <kbd className="kbd">↑↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="cmdk-footer-hint">
              <kbd className="kbd">↵</kbd>
              <span>Select</span>
            </div>
            <div className="cmdk-footer-hint">
              <kbd className="kbd">ESC</kbd>
              <span>Close</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}

// Export the keyboard shortcut hint badge for use in headers
export function CommandPaletteHint() {
  return (
    <button
      onClick={() => {
        const event = new KeyboardEvent('keydown', {
          key: 'k',
          metaKey: true,
          bubbles: true,
        });
        document.dispatchEvent(event);
      }}
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg
                 bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200/50
                 text-slate-500 text-sm transition-all duration-200
                 hover:shadow-sm group"
    >
      <IconSearch size={14} className="text-slate-400 group-hover:text-slate-500" />
      <span className="text-slate-400">Search...</span>
      <kbd className="kbd ml-1">⌘K</kbd>
    </button>
  );
}
