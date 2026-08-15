'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronUp, ChevronDown, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { CalendarSyncButton } from './CalendarSyncButton';
import { Button, IconButton } from '@/components/ui/button';

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  /**
   * Which side of the roster/coach merge this row came from.
   *
   * The calendar page builds this list by concatenating the team's players
   * with the ORGANISATION's coaches, and without this tag the two are
   * structurally indistinguishable — which is how every coach in the org ended
   * up listed in a control that filters the calendar by player. Optional
   * because not every caller tags (the event editor's invite grid wants staff
   * included); surfaces that mean *players* filter on it.
   */
  role?: 'coach' | 'player';
}

// Color palette for multi-player selection — intentional hardcoded hex values.
// These are applied via inline `style` objects for dynamic avatar backgrounds,
// so they cannot use Tailwind classes. Each color maps to a standard Tailwind
// palette value (primary-500, blue-500, amber-500, pink-500, purple-500, teal-500,
// orange-500, cyan-500) for visual consistency.
export const PLAYER_COLORS = [
  { bg: '#22c55e', light: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)', name: 'Green' },
  { bg: '#3b82f6', light: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', name: 'Blue' },
  { bg: '#f59e0b', light: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', name: 'Amber' },
  { bg: '#ec4899', light: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.4)', name: 'Pink' },
  { bg: '#8b5cf6', light: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.4)', name: 'Purple' },
  { bg: '#14b8a6', light: 'rgba(20, 184, 166, 0.15)', border: 'rgba(20, 184, 166, 0.4)', name: 'Teal' },
  { bg: '#f97316', light: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)', name: 'Orange' },
  { bg: '#06b6d4', light: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.4)', name: 'Cyan' },
];

interface CalendarAvatarSidebarProps {
  teamMembers: TeamMember[];
  selectedPlayerIds: string[]; // Multi-selection
  onPlayerSelect: (playerIds: string[]) => void;
  onSyncSettings?: () => void;
}

export function CalendarAvatarSidebar({
  teamMembers,
  selectedPlayerIds,
  onPlayerSelect,
  onSyncSettings,
}: CalendarAvatarSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const isAllSelected = selectedPlayerIds.length === 0;

  // Check scroll position for indicators
  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    // Also check on resize
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      observer.disconnect();
    };
  }, [checkScroll, teamMembers.length]);

  const getPlayerColor = (playerId: string) => {
    const index = selectedPlayerIds.indexOf(playerId);
    if (index === -1) return null;
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  };

  const handleAllClick = () => {
    onPlayerSelect([]);
  };

  const [maxSelectionShake, setMaxSelectionShake] = useState(false);

  const handleMemberClick = (memberId: string) => {
    if (selectedPlayerIds.includes(memberId)) {
      onPlayerSelect(selectedPlayerIds.filter(id => id !== memberId));
    } else if (selectedPlayerIds.length < 8) {
      onPlayerSelect([...selectedPlayerIds, memberId]);
    } else {
      // Max selection reached - show feedback
      setMaxSelectionShake(true);
      setTimeout(() => setMaxSelectionShake(false), 600);
    }
  };

  const getInitials = (member: TeamMember) => {
    return `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`.toUpperCase();
  };

  const getFullName = (member: TeamMember) => {
    return `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Team Member';
  };

  // Collapsed state
  if (isCollapsed) {
    return (
      <div className="relative">
        <Tooltip content="Expand sidebar" side="right">
          <IconButton variant="default"
            onClick={() => setIsCollapsed(false)}
            className="absolute left-0 top-3 z-30 w-6 h-10 bg-glass backdrop-blur-sm border border-warm-200/55 rounded-r-xl flex items-center justify-center hover:bg-cream-100 hover:scale-105 shadow-sm transition-all duration-200"
            aria-label="Expand player filter"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-warm-500 rotate-180" />
          </IconButton>
        </Tooltip>
      </div>
    );
  }

  // Get selected players for legend
  const selectedPlayers = selectedPlayerIds
    .map(id => teamMembers.find(m => m.id === id))
    .filter((m): m is TeamMember => m !== undefined);

  return (
    <aside aria-label="Player filter" className="w-[80px] px-3 pt-4 pb-3 flex flex-col items-center gap-3 surface-matte rounded-3xl flex-shrink-0 relative overflow-visible z-20 min-h-0">
      {/* Collapse Handle */}
      <IconButton variant="default"
        onClick={() => setIsCollapsed(true)}
        aria-label="Collapse player filter"
        className="absolute -right-3 top-4 w-6 h-12 bg-cream-50/92 border border-warm-200/55 rounded-r-xl flex items-center justify-center text-warm-400 cursor-pointer shadow-sm"
      >
        <ChevronLeft className="w-4 h-4" />
      </IconButton>

      {/* ALL Button */}
      <Tooltip content="Show all team events" side="right">
        <Button variant="primary"
          onClick={handleAllClick}
          aria-pressed={isAllSelected}
          className={cn(
            'relative z-10 w-12 h-12 rounded-lg flex items-center justify-center font-medium text-label tracking-wide cursor-pointer transition-all duration-200 border-none flex-shrink-0',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
            isAllSelected
              ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-[0_2px_8px_rgba(22,163,74,0.3)]'
              : 'bg-warm-100/80 text-warm-500 hover:bg-warm-200/90 hover:text-warm-700'
          )}
        >
          ALL
        </Button>
      </Tooltip>

      {/* Divider */}
      <div className="relative z-10 w-8 h-px bg-gradient-to-r from-transparent via-warm-300/60 to-transparent flex-shrink-0" aria-hidden="true" />

      {/* Scrollable Avatar List with Gradient Masks */}
      <div className="flex-1 min-h-0 w-full relative overflow-hidden isolate">
        {/* Top scroll fade indicator */}
        {canScrollUp && (
          <div aria-hidden="true" className="absolute top-0 left-0 right-0 h-7 bg-gradient-to-b from-white/95 to-transparent z-base pointer-events-none flex items-start justify-center pt-0.5 rounded-t-lg">
            <ChevronUp className="w-3 h-3 text-warm-400 pointer-events-none" />
          </div>
        )}

        {/* Avatar scroll container */}
        <div
          ref={scrollRef}
          role="listbox"
          aria-label="Team members"
          aria-multiselectable="true"
          className={cn(
            'h-full flex flex-col gap-3 overflow-y-auto overflow-x-hidden w-full items-center py-1 scrollbar-none',
            maxSelectionShake && 'animate-shake',
          )}
        >
          {teamMembers.length === 0 ? (
            <div className="py-6 text-center">
              <div className="w-12 h-12 rounded-lg bg-warm-100/60 flex items-center justify-center mx-auto mb-2">
                <svg className="w-5 h-5 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-eyebrow text-warm-500 leading-tight">
                No team<br />members
              </p>
            </div>
          ) : (
            teamMembers.map((member) => {
              const selected = selectedPlayerIds.includes(member.id);
              const playerColor = getPlayerColor(member.id);

              return (
                <Tooltip
                  key={member.id}
                  content={selected ? `${getFullName(member)} (viewing schedule)` : `View ${getFullName(member)}'s schedule`}
                  side="right"
                  delayMs={300}
                >
                  <Button variant="ghost"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handleMemberClick(member.id)}
                    aria-label={getFullName(member)}
                    className={cn(
                      'w-12 h-12 rounded-lg flex items-center justify-center text-sm font-medium cursor-pointer transition-all duration-200 border-none flex-shrink-0 relative overflow-visible',
                      !selected && 'bg-warm-100/65 text-warm-600 shadow-sm',
                      selected && 'scale-[1.08]',
                    )}
                    style={
                      selected && playerColor
                        ? {
                            background: `linear-gradient(135deg, ${playerColor.bg} 0%, ${playerColor.bg}dd 100%)`,
                            color: 'white',
                            boxShadow: `0 0 0 3px ${playerColor.border}, 0 4px 14px ${playerColor.border}`,
                          }
                        : undefined
                    }
                  >
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={getFullName(member)}
                        className="w-full h-full rounded-lg object-cover"
                      />
                    ) : (
                      <span>{getInitials(member)}</span>
                    )}

                    {/* Selection indicator with color number */}
                    {selected && playerColor && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-white text-eyebrow font-medium"
                        style={{ background: playerColor.bg }}
                      >
                        {selectedPlayerIds.indexOf(member.id) + 1}
                      </span>
                    )}
                  </Button>
                </Tooltip>
              );
            })
          )}
        </div>

        {/* Bottom scroll fade indicator */}
        {canScrollDown && (
          <div aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-7 bg-gradient-to-t from-white/95 to-transparent z-base pointer-events-none flex items-end justify-center pb-0.5 rounded-b-lg">
            <ChevronDown className="w-3 h-3 text-warm-400 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Color Legend - Inline when players selected */}
      {selectedPlayers.length > 0 && (
        <div className="w-full px-1 py-2 border-t border-warm-300/40 flex-shrink-0">
          <div className="flex items-center justify-center gap-1 mb-1.5">
            <span className="text-eyebrow font-medium text-warm-400 uppercase tracking-[0.1em]">
              Legend
            </span>
            <span className="text-eyebrow font-medium text-warm-400 tabular-nums">
              · {selectedPlayers.length}
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {selectedPlayers.map((player, index) => {
              const color = PLAYER_COLORS[index % PLAYER_COLORS.length]!;
              return (
                <li
                  key={player.id}
                  className="flex items-center gap-1.5 px-0.5"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-white/80"
                    style={{ background: color.bg }}
                    aria-hidden="true"
                  />
                  <span
                    className="text-eyebrow text-warm-600 font-medium overflow-hidden text-ellipsis whitespace-nowrap"
                    title={getFullName(player)}
                  >
                    {player.first_name}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Bottom actions */}
      <div className="w-full border-t border-warm-300/40 pt-2.5 mt-auto flex-shrink-0 flex flex-col items-center gap-2">
        <CalendarSyncButton variant="icon" />
        <Tooltip content="Manage feeds" side="right">
          <IconButton variant="default"
            onClick={() => onSyncSettings?.()}
            className="w-12 h-12 rounded-lg flex items-center justify-center bg-warm-100/60 text-warm-400 cursor-pointer transition-all duration-200 border-none flex-shrink-0 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200"
            aria-label="Manage feeds"
          >
            <Settings2 className="w-5 h-5" />
          </IconButton>
        </Tooltip>
      </div>
    </aside>
  );
}
