'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconPlus, IconCheck, IconVideo } from '@/components/icons';
import { formatHeight, getFullName } from '@/lib/utils';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useAuth } from '@/hooks/use-auth';
import { usePeekPanelStore } from '@/stores/peek-panel-store';
import type { Player } from '@/lib/types';

interface PlayerCardProps {
  player: Player;
  showWatchlistButton?: boolean;
  usePeekPanel?: boolean;
}

export function PlayerCard({ player, showWatchlistButton = true, usePeekPanel = true }: PlayerCardProps) {
  const { openPlayerPanel } = usePeekPanelStore();
  const { user } = useAuth();
  const { isOnWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const onWatchlist = isOnWatchlist(player.id);
  const name = getFullName(player.first_name, player.last_name);
  const isCoach = user?.role === 'coach';

  const handleWatchlistClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onWatchlist) await removeFromWatchlist(player.id);
    else await addToWatchlist(player.id);
  };

  const handleCardClick = () => {
    if (usePeekPanel) {
      openPlayerPanel(player.id);
    }
  };

  return (
    <div onClick={handleCardClick} className={usePeekPanel ? 'cursor-pointer' : ''}>
      <Card hover className="overflow-hidden h-full group relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
        <CardContent className="p-5 relative">
          <div className="flex items-start gap-4">
            <Avatar name={name} size="lg" src={player.avatar_url} className="group-hover:scale-110 transition-transform duration-300" ring />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900 truncate">{name}</h3>
                  <p className="text-sm leading-relaxed text-slate-500 truncate">{player.high_school_name}</p>
                  <p className="text-xs text-slate-400">{player.city}, {player.state}</p>
                </div>
                {player.has_video && <IconVideo size={16} className="text-brand-600 flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge>{player.primary_position}</Badge>
                <Badge variant="success">{player.grad_year}</Badge>
                {player.committed_to && <Badge variant="info">Committed</Badge>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-border-light">
            <div>
              <p className="text-2xs text-slate-400 uppercase tracking-wide">Height</p>
              <p className="text-sm font-medium text-slate-900">{formatHeight(player.height_feet, player.height_inches)}</p>
            </div>
            <div>
              <p className="text-2xs text-slate-400 uppercase tracking-wide">Weight</p>
              <p className="text-sm font-medium text-slate-900">{player.weight_lbs ? `${player.weight_lbs}` : '—'}</p>
            </div>
            <div>
              <p className="text-2xs text-slate-400 uppercase tracking-wide">Velo</p>
              <p className="text-sm font-medium text-slate-900">{player.pitch_velo || player.exit_velo || '—'}</p>
            </div>
            <div>
              <p className="text-2xs text-slate-400 uppercase tracking-wide">GPA</p>
              <p className="text-sm font-medium text-slate-900">{player.gpa?.toFixed(2) || '—'}</p>
            </div>
          </div>

          {showWatchlistButton && isCoach && (
            <div className="mt-4 pt-4 border-t border-border-light">
              <Button size="sm" variant={onWatchlist ? 'secondary' : 'primary'} onClick={handleWatchlistClick} className="w-full">
                {onWatchlist ? <><IconCheck size={14} /> On Watchlist</> : <><IconPlus size={14} /> Add to Watchlist</>}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
