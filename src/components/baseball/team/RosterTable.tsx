'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconSearch, IconUser } from '@/components/icons';
import { getFullName, formatRelativeTime } from '@/lib/utils';

interface RosterEntry {
  id: string;
  joined_at: string | null;
  jersey_number: number | null;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
    grad_year: number | null;
    gpa: number | null;
    recruiting_activated: boolean | null;
  };
}

interface RosterTableProps {
  roster: RosterEntry[];
}

export function RosterTable({ roster }: RosterTableProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRoster = useMemo(() => {
    if (!searchQuery) return roster;
    const query = searchQuery.toLowerCase();
    return roster.filter((member) => {
      const name = getFullName(member.player?.first_name, member.player?.last_name).toLowerCase();
      return (
        name.includes(query) ||
        member.player?.primary_position?.toLowerCase().includes(query) ||
        member.player?.grad_year?.toString().includes(query)
      );
    });
  }, [roster, searchQuery]);

  return (
    <Card variant="glass">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Roster Management</h2>
          <p className="text-sm leading-relaxed text-slate-500 mt-1">
            View and manage your full roster with quick access to player profiles.
          </p>
        </div>
        <div className="w-full md:max-w-xs relative">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search players..."
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filteredRoster.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No players match your search.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRoster.map((member) => {
              const name = getFullName(member.player?.first_name, member.player?.last_name);
              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={name} src={member.player?.avatar_url || undefined} size="sm" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{name}</p>
                      <p className="text-xs text-slate-500">
                        {member.player?.primary_position || 'Position N/A'} • Class of {member.player?.grad_year || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {member.player?.gpa && (
                      <Badge variant={member.player.gpa >= 3.0 ? 'success' : member.player.gpa >= 2.5 ? 'warning' : 'danger'}>
                        GPA {member.player.gpa.toFixed(2)}
                      </Badge>
                    )}
                    {member.player?.recruiting_activated && (
                      <Badge variant="success">Recruiting Active</Badge>
                    )}
                    {member.joined_at && (
                      <span>Joined {formatRelativeTime(member.joined_at)}</span>
                    )}
                  </div>
                  <div>
                    <Link href={`/baseball/dashboard/players/${member.player?.id}`}>
                      <Button variant="ghost" size="sm">
                        <IconUser size={16} className="mr-1.5" />
                        View Profile
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
