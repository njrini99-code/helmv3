'use client';

import { useState } from 'react';
import { ChevronLeft, Settings2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { CalendarSyncButton } from './CalendarSyncButton';

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

// Color palette for multi-player selection
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

export interface CalendarAvatarSidebarProps {
  teamMembers: TeamMember[];
  selectedPlayerIds: string[]; // Multi-selection
  onPlayerSelect: (playerIds: string[]) => void;
  onSyncSettings?: () => void;
}

/**
 * Calendar Avatar Sidebar - Multi-Player Selection
 *
 * Allows selecting multiple players to compare their schedules.
 * Each selected player gets a unique color from the palette.
 * Shows a color legend when multiple players are selected.
 */
export function CalendarAvatarSidebar({
  teamMembers,
  selectedPlayerIds,
  onPlayerSelect,
}: CalendarAvatarSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isAllSelected = selectedPlayerIds.length === 0;

  // Get color for a player based on their selection order
  const getPlayerColor = (playerId: string) => {
    const index = selectedPlayerIds.indexOf(playerId);
    if (index === -1) return null;
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  };

  const handleAllClick = () => {
    onPlayerSelect([]); // Clear all selections - show team events only
  };

  const handleMemberClick = (memberId: string) => {
    if (selectedPlayerIds.includes(memberId)) {
      // Deselect this player
      onPlayerSelect(selectedPlayerIds.filter(id => id !== memberId));
    } else {
      // Add this player to selection (max 8 for color variety)
      if (selectedPlayerIds.length < 8) {
        onPlayerSelect([...selectedPlayerIds, memberId]);
      }
    }
  };

  const isMemberSelected = (memberId: string) => {
    return selectedPlayerIds.includes(memberId);
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
          <button
            onClick={() => setIsCollapsed(false)}
            className="absolute left-0 top-3 z-30 w-6 h-10 bg-white/80 backdrop-blur-sm border border-white/40 rounded-r-xl flex items-center justify-center hover:bg-white hover:scale-105 shadow-sm transition-all duration-200"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-stone-500 rotate-180" />
          </button>
        </Tooltip>
      </div>
    );
  }

  // Get selected players for legend
  const selectedPlayers = selectedPlayerIds
    .map(id => teamMembers.find(m => m.id === id))
    .filter((m): m is TeamMember => m !== undefined);

  return (
    <div className="flex flex-col gap-3">
      {/* Main Sidebar */}
      <aside
        style={{
          width: '80px',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          borderRadius: '20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6)',
          flexShrink: 0,
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {/* Collapse Button */}
        <button
          onClick={() => setIsCollapsed(true)}
          title="Collapse sidebar"
          style={{
            position: 'absolute',
            right: '-12px',
            top: '16px',
            width: '24px',
            height: '48px',
            background: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            borderRadius: '0 12px 12px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a8a29e',
            cursor: 'pointer',
            boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
          }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* ALL Button */}
        <Tooltip content="Show team events only" side="right">
          <button
            onClick={handleAllClick}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '11px',
              letterSpacing: '0.025em',
              cursor: 'pointer',
              transition: 'all 0.2s ease-out',
              border: 'none',
              flexShrink: 0,
              ...(isAllSelected
                ? {
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: 'white',
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)',
                  }
                : {
                    background: 'rgba(245, 245, 244, 0.9)',
                    color: '#78716c',
                  }),
            }}
          >
            ALL
          </button>
        </Tooltip>

        {/* Divider */}
        <div
          style={{
            width: '32px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, #d6d3d1, transparent)',
            flexShrink: 0,
          }}
        />

        {/* Team Member Avatars */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            overflowY: 'auto',
            overflowX: 'hidden',
            width: '100%',
            alignItems: 'center',
            paddingTop: '4px',
            paddingBottom: '4px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {teamMembers.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: 'rgba(245, 245, 244, 0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px',
                }}
              >
                <svg className="w-5 h-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p style={{ fontSize: '9px', color: '#78716c', lineHeight: 1.3 }}>
                No team<br />members
              </p>
            </div>
          ) : (
            teamMembers.map((member) => {
              const selected = isMemberSelected(member.id);
              const playerColor = getPlayerColor(member.id);

              return (
                <Tooltip
                  key={member.id}
                  content={selected ? `${getFullName(member)} (viewing schedule)` : `Click to view ${getFullName(member)}'s schedule`}
                  side="right"
                  delayMs={300}
                >
                  <button
                    onClick={() => handleMemberClick(member.id)}
                    title={getFullName(member)}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-out',
                      border: 'none',
                      flexShrink: 0,
                      position: 'relative',
                      ...(selected && playerColor
                        ? {
                            background: `linear-gradient(135deg, ${playerColor.bg} 0%, ${playerColor.bg}dd 100%)`,
                            color: 'white',
                            boxShadow: `0 0 0 3px ${playerColor.border}, 0 4px 14px ${playerColor.border}`,
                            transform: 'scale(1.08)',
                          }
                        : {
                            background: 'linear-gradient(135deg, #fafaf9 0%, #e7e5e4 100%)',
                            color: '#57534e',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                          }),
                    }}
                  >
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={getFullName(member)}
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '14px',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <span>{getInitials(member)}</span>
                    )}

                    {/* Selection indicator with color */}
                    {selected && playerColor && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          width: '16px',
                          height: '16px',
                          background: playerColor.bg,
                          borderRadius: '50%',
                          border: '2px solid white',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '9px',
                          fontWeight: 700,
                        }}
                      >
                        {selectedPlayerIds.indexOf(member.id) + 1}
                      </span>
                    )}
                  </button>
                </Tooltip>
              );
            })
          )}
        </div>

        {/* Bottom Divider */}
        <div
          style={{
            width: '100%',
            borderTop: '1px solid rgba(214, 211, 209, 0.5)',
            paddingTop: '12px',
            marginTop: 'auto',
          }}
        />

        {/* Calendar Sync Button - Always visible */}
        <CalendarSyncButton variant="icon" />

        {/* Feed Settings Button - Opens advanced feed manager */}
        <Tooltip content="Manage feeds" side="right">
          <button
            onClick={() => {/* onSyncSettings removed from being passed down */}}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(245, 245, 244, 0.6)',
              color: '#a8a29e',
              cursor: 'pointer',
              transition: 'all 0.2s ease-out',
              border: 'none',
              flexShrink: 0,
            }}
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </Tooltip>
      </aside>

      {/* Color Legend - Shows when multiple players selected */}
      {selectedPlayers.length > 0 && (
        <div
          style={{
            width: '80px',
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            borderRadius: '16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          }}
        >
          <p
            style={{
              fontSize: '9px',
              fontWeight: 600,
              color: '#78716c',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
              textAlign: 'center',
            }}
          >
            Legend
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {selectedPlayers.map((player, index) => {
              const color = PLAYER_COLORS[index % PLAYER_COLORS.length]!;
              return (
                <div
                  key={player.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '4px',
                      background: color.bg,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#57534e',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={getFullName(player)}
                  >
                    {player.first_name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
