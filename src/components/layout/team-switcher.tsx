'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTeamStore, type Team } from '@/stores/team-store';
import { IconChevronDown, IconCheck, IconUsers } from '@/components/icons';

interface TeamSwitcherProps {
  collapsed?: boolean;
}

export function TeamSwitcher({ collapsed = false }: TeamSwitcherProps) {
  const router = useRouter();
  const { teams, selectedTeamId, setSelectedTeamId, getSelectedTeam } = useTeamStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedTeam = getSelectedTeam();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTeamSelect = (team: Team) => {
    setSelectedTeamId(team.id);
    setIsOpen(false);
    // Refresh the page to load new team data
    router.refresh();
  };

  if (teams.length === 0) {
    return null;
  }

  // Collapsed view - just show icon
  if (collapsed) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={selectedTeam?.name || 'Select team'}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          {selectedTeam?.logo_url ? (
            <img
              src={selectedTeam.logo_url}
              alt={selectedTeam.name}
              className="w-6 h-6 rounded-lg object-cover"
            />
          ) : (
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-medium"
              style={{ backgroundColor: selectedTeam?.primary_color || '#16A34A' }}
            >
              {selectedTeam?.name?.charAt(0) || 'T'}
            </div>
          )}
        </button>

        {isOpen && (
          <div className="absolute left-full ml-2 top-0 w-56 bg-white rounded-xl border border-slate-200 shadow-lg py-2 z-50">
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Switch Team
              </p>
            </div>
            <div className="py-1">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => handleTeamSelect(team)}
                  className={cn(
                    'w-full px-3 py-2 flex items-center gap-3 hover:bg-slate-50 transition-colors',
                    team.id === selectedTeamId && 'bg-green-50'
                  )}
                >
                  {team.logo_url ? (
                    <img
                      src={team.logo_url}
                      alt={team.name}
                      className="w-8 h-8 rounded-lg object-cover"
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                      style={{ backgroundColor: team.primary_color || '#16A34A' }}
                    >
                      {team.name?.charAt(0) || 'T'}
                    </div>
                  )}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-slate-900 truncate">{team.name}</p>
                    <p className="text-xs text-slate-500">{team.age_group || team.team_type}</p>
                  </div>
                  {team.id === selectedTeamId && (
                    <IconCheck size={16} className="text-green-600" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Expanded view
  return (
    <div className="relative mb-4 px-1" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full px-3 py-2.5 rounded-xl border transition-all duration-200',
          'flex items-center gap-3 text-left',
          isOpen
            ? 'border-green-500 ring-2 ring-green-100 bg-white'
            : 'border-slate-200 bg-white hover:border-slate-300'
        )}
      >
        {selectedTeam?.logo_url ? (
          <img
            src={selectedTeam.logo_url}
            alt={selectedTeam.name}
            className="w-8 h-8 rounded-lg object-cover"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium"
            style={{ backgroundColor: selectedTeam?.primary_color || '#16A34A' }}
          >
            {selectedTeam?.name?.charAt(0) || 'T'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {selectedTeam?.name || 'Select Team'}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {selectedTeam?.age_group || selectedTeam?.team_type || 'No team selected'}
          </p>
        </div>
        <IconChevronDown
          size={16}
          className={cn(
            'text-slate-400 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-lg py-2 z-50">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Your Teams ({teams.length})
            </p>
          </div>
          <div className="py-1 max-h-64 overflow-y-auto">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => handleTeamSelect(team)}
                className={cn(
                  'w-full px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors',
                  team.id === selectedTeamId && 'bg-green-50'
                )}
              >
                {team.logo_url ? (
                  <img
                    src={team.logo_url}
                    alt={team.name}
                    className="w-8 h-8 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: team.primary_color || '#16A34A' }}
                  >
                    {team.name?.charAt(0) || 'T'}
                  </div>
                )}
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{team.name}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{team.age_group || team.team_type}</span>
                    {team.member_count !== undefined && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <IconUsers size={12} />
                          {team.member_count}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {team.id === selectedTeamId && (
                  <IconCheck size={16} className="text-green-600 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 px-3 py-2 mt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/baseball/dashboard/teams');
              }}
              className="w-full text-sm text-green-600 hover:text-green-700 font-medium py-1.5"
            >
              Manage All Teams →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
