'use client';

import { useState } from 'react';
import { ChevronLeft, RefreshCw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

export interface CalendarAvatarSidebarProps {
  teamMembers: TeamMember[];
  selectedMemberIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onSyncSettings?: () => void;
}

export function CalendarAvatarSidebar({
  teamMembers,
  selectedMemberIds,
  onSelectionChange,
  onSyncSettings,
}: CalendarAvatarSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isAllSelected = selectedMemberIds.length === 0 || selectedMemberIds.length === teamMembers.length;

  const handleAllClick = () => {
    onSelectionChange([]);
  };

  const handleMemberClick = (memberId: string) => {
    if (selectedMemberIds.includes(memberId)) {
      const newIds = selectedMemberIds.filter(id => id !== memberId);
      onSelectionChange(newIds.length === 0 ? [] : newIds);
    } else {
      onSelectionChange([...selectedMemberIds, memberId]);
    }
  };

  const isMemberSelected = (memberId: string) => {
    return isAllSelected || selectedMemberIds.includes(memberId);
  };

  const getInitials = (member: TeamMember) => {
    return `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`.toUpperCase();
  };

  const getFullName = (member: TeamMember) => {
    return `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Team Member';
  };

  // Collapsed state - minimal expand button
  if (isCollapsed) {
    return (
      <div className="relative">
        <Tooltip content="Expand sidebar" side="right">
          <button
            onClick={() => setIsCollapsed(false)}
            className="
              absolute left-0 top-3 z-30
              w-6 h-10
              bg-white/80 backdrop-blur-sm
              border border-stone-200/60
              rounded-r-[10px]
              flex items-center justify-center
              hover:bg-white hover:scale-105
              shadow-[0_2px_8px_rgba(0,0,0,0.06)]
              transition-all duration-200
            "
          >
            <ChevronLeft className="w-3.5 h-3.5 text-stone-500 rotate-180" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <aside className="
      relative w-[72px] flex-shrink-0

      /* WARM GLASS BACKGROUND */
      bg-stone-50/80
      backdrop-blur-sm

      /* BORDER */
      border border-stone-200/60

      /* CORNERS */
      rounded-[16px]

      /* SHADOW */
      shadow-sm

      /* LAYOUT */
      flex flex-col items-center
      py-4 px-3

      /* ANIMATION */
      transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]

      overflow-visible
    ">
      {/* Collapse Button - Right edge (NO Tooltip wrapper to preserve absolute positioning) */}
      <button
        onClick={() => setIsCollapsed(true)}
        title="Collapse sidebar"
        className="
          absolute -right-3 top-4 z-10
          w-6 h-12
          bg-white/80 backdrop-blur-sm
          border border-stone-200/60
          rounded-r-lg
          flex items-center justify-center
          text-stone-400
          hover:text-stone-600 hover:bg-white
          shadow-sm
          transition-all duration-200
        "
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* ALL Button - TEXT not icon, SQUARE with rounded corners */}
      <Tooltip content="Show all events" side="right">
        <button
          onClick={handleAllClick}
          className={cn(
            // SIZE: 48x48px square with 12px rounded corners (NOT circular)
            'w-12 h-12 rounded-[12px] flex-shrink-0',

            // CENTER THE TEXT
            'flex items-center justify-center',

            // TYPOGRAPHY - Bold text
            'font-bold text-xs tracking-wide',

            // TRANSITIONS
            'transition-all duration-200',

            isAllSelected
              ? [
                  // SELECTED STATE
                  'bg-gradient-to-br from-emerald-500 to-emerald-600',
                  'text-white',
                  'shadow-lg shadow-emerald-500/30',
                  'ring-2 ring-emerald-600 ring-offset-2 ring-offset-stone-50',
                  'scale-105',
                ]
              : [
                  // UNSELECTED STATE
                  'bg-gradient-to-br from-emerald-500 to-emerald-600',
                  'text-white',
                  'hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/25',
                ]
          )}
        >
          ALL
        </button>
      </Tooltip>

      {/* Gradient Divider */}
      <div className="
        w-8 h-px my-4 flex-shrink-0
        bg-gradient-to-r from-transparent via-stone-300 to-transparent
      " />

      {/* Team Member Avatars - Scrollable */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 scrollbar-thin w-full">
        {teamMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-12 h-12 rounded-[12px] bg-stone-200/60 flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-[9px] text-stone-500 px-1 leading-tight">
              No team<br />members
            </p>
          </div>
        ) : (
          teamMembers.map((member) => {
            const selected = isMemberSelected(member.id);

            return (
              <Tooltip
                key={member.id}
                content={getFullName(member)}
                side="right"
                delayMs={300}
              >
                <button
                  onClick={() => handleMemberClick(member.id)}
                  className={cn(
                    'w-12 h-12 rounded-[12px] flex items-center justify-center',
                    'text-xs font-semibold',
                    'transition-all duration-200 relative mx-auto',
                    'overflow-hidden',
                    selected
                      ? 'ring-2 ring-emerald-500/70 ring-offset-2 ring-offset-stone-50 scale-[1.02] shadow-[0_2px_8px_rgba(16,185,129,0.2)]'
                      : 'hover:ring-2 hover:ring-stone-300 hover:scale-[1.02] border border-stone-200/60'
                  )}
                  style={{
                    background: member.avatar_url
                      ? `url(${member.avatar_url}) center/cover`
                      : 'linear-gradient(135deg, #f5f5f4 0%, #e7e5e4 100%)',
                  }}
                >
                  {!member.avatar_url && (
                    <span className="text-stone-500">{getInitials(member)}</span>
                  )}

                  {/* Selection checkmark badge */}
                  {selected && !isAllSelected && (
                    <div className="
                      absolute -top-0.5 -right-0.5
                      w-4 h-4
                      bg-gradient-to-br from-emerald-500 to-emerald-600
                      rounded-full
                      flex items-center justify-center
                      shadow-[0_2px_4px_rgba(16,185,129,0.3)]
                      border-2 border-white
                    ">
                      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                    </div>
                  )}
                </button>
              </Tooltip>
            );
          })
        )}
      </div>

      {/* Gradient Divider */}
      <div className="
        w-8 h-px my-4 flex-shrink-0
        bg-gradient-to-r from-transparent via-stone-300 to-transparent
      " />

      {/* Sync Settings Button */}
      {onSyncSettings && (
        <Tooltip content="Sync settings" side="right">
          <button
            onClick={onSyncSettings}
            className="
              w-12 h-12 rounded-[12px] flex-shrink-0
              bg-stone-100/80
              flex items-center justify-center
              hover:bg-stone-200/80 hover:scale-[1.02]
              transition-all duration-200
              group
            "
          >
            <RefreshCw className="w-4 h-4 text-stone-500 group-hover:text-stone-700 transition-colors" />
          </button>
        </Tooltip>
      )}
    </aside>
  );
}
