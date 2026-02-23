'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { PeekPanelRoot } from './PeekPanelRoot';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  IconExternalLink,
  IconUsers,
  IconMapPin,
  IconSparkles,
  IconChevronRight,
  IconMail,
  IconBuilding,
  IconUser,
} from '@/components/icons';
import type { Organization } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CoachStaff {
  id: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  email: string | null;
  isPrimary: boolean;
}

interface RosterPlayer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryPosition: string | null;
  gradYear: number | null;
  avatarUrl: string | null;
  pitchVelo: number | null;
  exitVelo: number | null;
  recruitingActivated: boolean;
  playerType: string | null;
}

interface TeamWithDetails extends Organization {
  playerCount: number;
  recruitingActiveCount: number;
}

interface TeamPeekPanelProps {
  teamId: string | null;
  onClose: () => void;
}

// ─── Visibility rule ───────────────────────────────────────────────────────────
// JUCO: always visible (free). HS/showcase: only if recruiting_activated. College: never.
function isRosterVisible(player: Pick<RosterPlayer, 'playerType' | 'recruitingActivated'>): boolean {
  if (player.playerType === 'juco') return true;
  if (player.playerType === 'college') return false;
  return player.recruitingActivated === true;
}

// ─── Component ────────────────────────────────────────────────────────────────

type TabId = 'details' | 'roster';

const TYPE_LABELS: Record<string, string> = {
  high_school: 'High School',
  showcase: 'Showcase',
  travel_ball: 'Travel Ball',
  juco: 'JUCO',
};

export function TeamPeekPanel({ teamId, onClose }: TeamPeekPanelProps) {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [tab, setTab] = useState<TabId>('details');
  const [team, setTeam] = useState<TeamWithDetails | null>(null);
  const [staff, setStaff] = useState<CoachStaff[]>([]);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (teamId) {
      setTab('details');
      fetchAll(teamId);
    } else {
      setTeam(null);
      setStaff([]);
      setRoster([]);
    }
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async (id: string) => {
    setLoading(true);
    try {
      // Step 1: org data
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', id)
        .single();

      if (orgError || !orgData) {
        toast.error('Failed to load team profile');
        setLoading(false);
        return;
      }

      // Step 2: teams for this org
      const { data: orgTeams } = await supabase
        .from('baseball_teams')
        .select('id')
        .eq('organization_id', id);

      const teamIds = orgTeams?.map((t) => t.id) ?? [];

      // Step 3: coaching staff + roster in parallel
      const [staffResult, rosterResult] = await Promise.all([
        teamIds.length > 0
          ? supabase
              .from('baseball_team_coach_staff')
              .select('is_primary, role, baseball_coaches!inner(id, first_name, last_name, email, avatar_url)')
              .in('team_id', teamIds)
          : Promise.resolve({ data: null }),
        teamIds.length > 0
          ? supabase
              .from('baseball_team_members')
              .select('player:baseball_players!baseball_team_members_player_id_fkey(id, first_name, last_name, primary_position, grad_year, avatar_url, recruiting_activated, pitch_velo, exit_velo, player_type)')
              .in('team_id', teamIds)
          : Promise.resolve({ data: null }),
      ]);

      // Process coaching staff — deduplicate across teams
      const seenCoaches = new Set<string>();
      const staffList: CoachStaff[] = [];
      const rawStaff = (staffResult.data ?? []) as Array<{
        is_primary: boolean;
        role: string | null;
        baseball_coaches: unknown;
      }>;
      const sortedStaff = [...rawStaff].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
      sortedStaff.forEach((row) => {
        const c = row.baseball_coaches as { id: string; first_name: string | null; last_name: string | null; email: string | null; avatar_url: string | null } | null;
        if (!c || seenCoaches.has(c.id)) return;
        seenCoaches.add(c.id);
        staffList.push({
          id: c.id,
          name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Coach',
          title: row.is_primary ? 'Head Coach' : (row.role ?? 'Assistant Coach'),
          avatarUrl: c.avatar_url,
          email: c.email,
          isPrimary: row.is_primary ?? false,
        });
      });

      // Process roster — deduplicate + apply visibility rules
      const seenPlayers = new Set<string>();
      const rosterList: RosterPlayer[] = [];
      const rawMembers = (rosterResult.data ?? []) as Array<{ player: unknown }>;
      rawMembers.forEach((tm) => {
        const p = tm.player as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          primary_position: string | null;
          grad_year: number | null;
          avatar_url: string | null;
          pitch_velo: number | null;
          exit_velo: number | null;
          recruiting_activated: boolean;
          player_type: string | null;
        } | null;
        if (!p || seenPlayers.has(p.id)) return;
        const player: RosterPlayer = {
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          primaryPosition: p.primary_position,
          gradYear: p.grad_year,
          avatarUrl: p.avatar_url,
          pitchVelo: p.pitch_velo,
          exitVelo: p.exit_velo,
          recruitingActivated: p.recruiting_activated ?? false,
          playerType: p.player_type,
        };
        if (!isRosterVisible(player)) return;
        seenPlayers.add(p.id);
        rosterList.push(player);
      });
      rosterList.sort((a, b) => (a.gradYear ?? 9999) - (b.gradYear ?? 9999));

      setTeam({
        ...orgData,
        playerCount: rosterList.length,
        recruitingActiveCount: rosterList.filter((p) => p.recruitingActivated).length,
      });
      setStaff(staffList);
      setRoster(rosterList);
    } catch (err) {
      console.error('Error fetching team profile:', err);
      toast.error('Failed to load team profile');
    } finally {
      setLoading(false);
    }
  };

  if (!teamId) return null;

  return (
    <PeekPanelRoot isOpen={!!teamId} onClose={onClose} width="lg">
      {loading ? (
        <TeamPeekSkeleton />
      ) : team ? (
        <div className="flex flex-col h-full">
          {/* ── Header ────────────────────────────────────────────────── */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-start gap-4">
              {/* Logo */}
              <div
                className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center"
                style={{
                  backgroundColor: team.primary_color ? `${team.primary_color}15` : undefined,
                  borderColor: team.primary_color ? `${team.primary_color}30` : undefined,
                }}
              >
                {team.logo_url ? (
                  <Image src={team.logo_url} alt={team.name || 'Team'} width={64} height={64} className="object-contain" />
                ) : (
                  <IconBuilding size={28} className="text-slate-400" style={{ color: team.primary_color || undefined }} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-slate-900 leading-tight truncate">
                  {team.name || 'Unknown Team'}
                </h2>
                <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-500">
                  <IconMapPin size={13} className="flex-shrink-0" />
                  <span className="truncate">{team.location_city}, {team.location_state}</span>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge variant="primary">{TYPE_LABELS[team.type ?? 'high_school'] ?? team.type}</Badge>
                  {team.division && <Badge variant="secondary">{team.division}</Badge>}
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                <IconUsers size={15} className="text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Roster</p>
                  <p className="text-sm font-semibold text-slate-900">{team.playerCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-primary-50 rounded-xl px-3 py-2">
                <IconSparkles size={15} className="text-primary-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Recruiting</p>
                  <p className="text-sm font-semibold text-primary-600">{team.recruitingActiveCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────────────────── */}
          <div className="flex gap-1 px-6 pt-4 pb-0 flex-shrink-0">
            {(['details', 'roster'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 py-2 text-sm font-medium rounded-lg transition-all capitalize',
                  tab === t
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                )}
              >
                {t === 'details' ? 'Details' : `Roster (${roster.length})`}
              </button>
            ))}
          </div>

          {/* ── Tab Content ───────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {tab === 'details' && (
              <DetailsTab team={team} staff={staff} />
            )}
            {tab === 'roster' && (
              <RosterTab
                roster={roster}
                orgType={team.type}
                onPlayerClick={(playerId) => {
                  router.push(`/baseball/player/${playerId}`);
                  onClose();
                }}
              />
            )}
          </div>

          {/* ── Footer Actions ────────────────────────────────────────── */}
          <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 space-y-2">
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                router.push(`/baseball/program/${team.id}`);
                onClose();
              }}
            >
              <IconExternalLink size={15} className="mr-2" />
              Full Program Profile
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                router.push(`/baseball/dashboard/messages/new?team=${team.id}`);
                onClose();
              }}
            >
              <IconMail size={15} className="mr-2" />
              Contact Coach
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
          Team not found
        </div>
      )}
    </PeekPanelRoot>
  );
}

// ─── Details Tab ──────────────────────────────────────────────────────────────

function DetailsTab({ team, staff }: { team: TeamWithDetails; staff: CoachStaff[] }) {
  return (
    <>
      {/* Description */}
      {team.description && (
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">About</h3>
          <p className="text-sm leading-relaxed text-slate-600">{team.description}</p>
        </div>
      )}

      {/* Coaching Staff */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Coaching Staff</h3>
        {staff.length === 0 ? (
          <div className="flex items-center gap-3 py-4 text-sm text-slate-400">
            <IconUser size={18} className="text-slate-300" />
            <span>No coaching staff listed</span>
          </div>
        ) : (
          <div className="space-y-2">
            {staff.map((coach) => (
              <div
                key={coach.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
              >
                <Avatar name={coach.name} src={coach.avatarUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{coach.name}</p>
                  <p className="text-xs text-slate-500">{coach.title}</p>
                </div>
                {coach.isPrimary && (
                  <span className="flex-shrink-0 text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-100">
                    Head
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick facts */}
      {(team.conference || team.website_url) && (
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Program Info</h3>
          <div className="space-y-2 text-sm">
            {team.conference && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Conference</span>
                <span className="font-medium text-slate-900">{team.conference}</span>
              </div>
            )}
            {team.website_url && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Website</span>
                <a
                  href={team.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary-600 hover:underline truncate max-w-[160px]"
                >
                  Visit →
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Roster Tab ───────────────────────────────────────────────────────────────

function RosterTab({
  roster,
  orgType,
  onPlayerClick,
}: {
  roster: RosterPlayer[];
  orgType: string | null | undefined;
  onPlayerClick: (id: string) => void;
}) {
  if (roster.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
          <IconUsers size={22} className="text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">
          {orgType === 'juco' ? 'No players on roster yet' : 'No recruiting-active players yet'}
        </p>
        {orgType !== 'juco' && (
          <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
            Players appear here when they activate their recruiting profile
          </p>
        )}
      </div>
    );
  }

  // Group by grad year
  const byYear = roster.reduce<Record<string, RosterPlayer[]>>((acc, p) => {
    const year = p.gradYear?.toString() ?? 'Unknown';
    (acc[year] ??= []).push(p);
    return acc;
  }, {});
  const years = Object.keys(byYear).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="space-y-5">
      {years.map((year) => (
        <div key={year}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Class of {year}
          </p>
          <div className="space-y-1.5">
            {(byYear[year] ?? []).map((player) => (
              <button
                key={player.id}
                onClick={() => onPlayerClick(player.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-white hover:shadow-md hover:border-primary-100 border border-transparent transition-all text-left group"
              >
                <Avatar
                  name={`${player.firstName ?? ''} ${player.lastName ?? ''}`}
                  src={player.avatarUrl}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {player.firstName} {player.lastName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {player.primaryPosition ?? '—'}
                    {player.pitchVelo ? ` · ${player.pitchVelo} mph` : ''}
                    {player.exitVelo ? ` · ${player.exitVelo} exit` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {player.playerType === 'juco' ? (
                    <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">JUCO</span>
                  ) : (
                    <span className="text-xs text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded font-medium">Active</span>
                  )}
                  <IconChevronRight size={14} className="text-slate-300 group-hover:text-primary-400 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TeamPeekSkeleton() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-xl bg-slate-200 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-5 bg-slate-200 rounded w-3/4" />
          <div className="h-3 bg-slate-100 rounded w-1/2" />
          <div className="h-5 bg-slate-100 rounded w-20" />
        </div>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="h-12 bg-slate-100 rounded-xl" />
        <div className="h-12 bg-slate-100 rounded-xl" />
      </div>
      {/* Tabs */}
      <div className="h-9 bg-slate-100 rounded-lg" />
      {/* Content */}
      <div className="space-y-2">
        <div className="h-4 bg-slate-100 rounded w-1/4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
            <div className="w-8 h-8 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-slate-200 rounded w-1/2" />
              <div className="h-2.5 bg-slate-100 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
