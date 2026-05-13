'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatCard } from '@/components/features/stat-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageLoading } from '@/components/ui/loading';
import { IconUsers, IconVideo, IconCalendar, IconEye, IconLayers, IconSearch } from '@/components/icons';
import { getFullName, formatRelativeTime } from '@/lib/utils';
import { useTeams } from '@/hooks/use-teams';

interface OrgRosterEntry {
  id: string;
  team_id: string;
  jersey_number: number | null;
  joined_at: string | null;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
    grad_year: number | null;
    recruiting_activated: boolean | null;
  };
  team: {
    id: string;
    name: string;
    team_type: string | null;
  } | null;
}

interface OrgStats {
  teamCount: number;
  playerCount: number;
  activeRecruiting: number;
  videoCount: number;
  upcomingEvents: number;
}

interface OrgDashboardProps {
  teamFilterId: string;
}

export function OrgDashboard({ teamFilterId }: OrgDashboardProps) {
  const supabase = createClient();
  const { teams, isLoading: teamsLoading } = useTeams();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OrgStats>({
    teamCount: 0,
    playerCount: 0,
    activeRecruiting: 0,
    videoCount: 0,
    upcomingEvents: 0,
  });
  const [roster, setRoster] = useState<OrgRosterEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const teamIds = useMemo(() => {
    if (teamFilterId !== 'all') return [teamFilterId];
    return teams.map((team) => team.id);
  }, [teamFilterId, teams]);

  useEffect(() => {
    async function fetchOrgData() {
      if (teamsLoading) return;

      if (teamIds.length === 0) {
        setStats({
          teamCount: 0,
          playerCount: 0,
          activeRecruiting: 0,
          videoCount: 0,
          upcomingEvents: 0,
        });
        setRoster([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data: rosterData, error: rosterError } = await supabase
        .from('baseball_team_members')
        .select(`
          id,
          team_id,
          jersey_number,
          joined_at,
          player:baseball_players (
            id,
            first_name,
            last_name,
            avatar_url,
            primary_position,
            grad_year,
            recruiting_activated
          ),
          team:baseball_teams (
            id,
            name,
            team_type
          )
        `)
        .in('team_id', teamIds)
        .eq('status', 'active')
        .order('joined_at', { ascending: false });

      if (rosterError) {
        console.error('Failed to load organization roster:', rosterError);
        setRoster([]);
        setLoading(false);
        return;
      }

      const rosterEntries = (rosterData || []) as OrgRosterEntry[];
      setRoster(rosterEntries);

      const playerIds = Array.from(
        new Set(
          rosterEntries
            .map((entry) => entry.player?.id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const activeRecruiting = rosterEntries.filter(
        (entry) => entry.player?.recruiting_activated
      ).length;

      let videoCount = 0;
      if (playerIds.length > 0) {
        const { count } = await supabase
          .from('baseball_videos')
          .select('*', { count: 'exact', head: true })
          .in('player_id', playerIds);
        videoCount = count || 0;
      }

      const { count: eventsCount } = await supabase
        .from('baseball_events')
        .select('id', { count: 'exact', head: true })
        .in('team_id', teamIds)
        .gte('start_time', new Date().toISOString());

      setStats({
        teamCount: teamFilterId === 'all' ? teams.length : 1,
        playerCount: playerIds.length,
        activeRecruiting,
        videoCount,
        upcomingEvents: eventsCount || 0,
      });

      setLoading(false);
    }

    fetchOrgData();
  }, [supabase, teamIds, teamFilterId, teams.length, teamsLoading]);

  const filteredRoster = roster.filter((entry) => {
    if (!searchQuery) return true;
    const name = getFullName(entry.player?.first_name, entry.player?.last_name).toLowerCase();
    const query = searchQuery.toLowerCase();
    return (
      name.includes(query) ||
      entry.player?.primary_position?.toLowerCase().includes(query) ||
      entry.player?.grad_year?.toString().includes(query) ||
      entry.team?.name.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard label="Teams" value={stats.teamCount} icon={IconLayers} />
        <StatCard label="Players" value={stats.playerCount} icon={IconUsers} />
        <StatCard label="Recruiting Active" value={stats.activeRecruiting} icon={IconEye} />
        <StatCard label="Videos" value={stats.videoCount} icon={IconVideo} />
        <StatCard label="Upcoming Events" value={stats.upcomingEvents} icon={IconCalendar} />
      </div>

      <Card variant="glass">
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-warm-900">Organization Roster</h2>
              <p className="text-sm leading-relaxed text-warm-500">
                {teamFilterId === 'all' ? 'Showing all teams' : 'Showing selected team roster'}
              </p>
            </div>
            <div className="w-full md:max-w-xs relative">
              <IconSearch size={16} className="absolute left-3 top-1/2 -tranwarm-y-1/2 text-warm-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search players or teams..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredRoster.length === 0 ? (
            <div className="p-10 text-center text-sm text-warm-500">
              No roster entries found for this selection.
            </div>
          ) : (
            <div className="divide-y divide-warm-100">
              {filteredRoster.map((entry) => {
                const name = getFullName(entry.player?.first_name, entry.player?.last_name);
                return (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={name} src={entry.player?.avatar_url} size="sm" />
                      <div>
                        <p className="text-sm font-semibold text-warm-900">{name}</p>
                        <p className="text-xs text-warm-500">
                          {entry.player?.primary_position || 'Position N/A'} • {entry.player?.grad_year || 'Grad Year N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-warm-500">
                      {entry.team && (
                        <Badge variant="secondary" className="text-xs">
                          {entry.team.name}
                        </Badge>
                      )}
                      {entry.team?.team_type && (
                        <Badge variant="default" className="text-xs">
                          {entry.team.team_type}
                        </Badge>
                      )}
                      {entry.player?.recruiting_activated && (
                        <Badge variant="success" className="text-xs">
                          Recruiting Active
                        </Badge>
                      )}
                      {entry.joined_at && (
                        <span>Joined {formatRelativeTime(entry.joined_at)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
