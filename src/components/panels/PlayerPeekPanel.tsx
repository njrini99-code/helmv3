'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PeekPanelRoot } from './PeekPanelRoot';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  IconExternalLink, 
  IconStar, 
  IconStarFilled,
  IconVideo,
  IconRuler,
  IconActivity,
  IconTarget,
  IconGraduationCap
} from '@/components/icons';
import { getFullName, formatHeight, cn } from '@/lib/utils';
import type { Player } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface PlayerPeekPanelProps {
  playerId: string | null;
  onClose: () => void;
}

export function PlayerPeekPanel({ playerId, onClose }: PlayerPeekPanelProps) {
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  useEffect(() => {
    if (playerId) {
      fetchPlayer(playerId);
      checkWatchlistStatus(playerId);
    } else {
      setPlayer(null);
    }
  }, [playerId]);

  const fetchPlayer = async (id: string) => {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching player:', error);
      toast.error('Failed to load player details');
    } else {
      setPlayer(data);
    }
    setLoading(false);
  };

  const checkWatchlistStatus = async (id: string) => {
    const supabase = createClient();
    
    // Get current coach
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: coach } = await supabase
      .from('coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) return;

    // Check if player is in watchlist
    const { data } = await supabase
      .from('watchlists')
      .select('id')
      .eq('coach_id', coach.id)
      .eq('player_id', id)
      .single();

    setIsInWatchlist(!!data);
  };

  const handleToggleWatchlist = async () => {
    if (!player) return;

    setWatchlistLoading(true);
    const supabase = createClient();

    // Get current coach
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('You must be logged in');
      setWatchlistLoading(false);
      return;
    }

    const { data: coach } = await supabase
      .from('coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      toast.error('Coach not found');
      setWatchlistLoading(false);
      return;
    }

    if (isInWatchlist) {
      // Remove from watchlist
      const { error } = await supabase
        .from('watchlists')
        .delete()
        .eq('coach_id', coach.id)
        .eq('player_id', player.id);

      if (error) {
        toast.error('Failed to remove from watchlist');
      } else {
        setIsInWatchlist(false);
        toast.success('Removed from watchlist');
      }
    } else {
      // Add to watchlist
      const { error } = await supabase
        .from('watchlists')
        .insert({
          coach_id: coach.id,
          player_id: player.id,
          pipeline_stage: 'watchlist',
        });

      if (error) {
        toast.error('Failed to add to watchlist');
      } else {
        setIsInWatchlist(true);
        toast.success('Added to watchlist');
      }
    }

    setWatchlistLoading(false);
  };

  const handleViewFullProfile = () => {
    if (player) {
      router.push(`/baseball/player/${player.id}`);
      onClose();
    }
  };

  if (!playerId) return null;

  return (
    <PeekPanelRoot isOpen={!!playerId} onClose={onClose} width="lg">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
        </div>
      ) : player ? (
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            <Avatar
              name={getFullName(player.first_name, player.last_name)}
              src={player.avatar_url}
              size="xl"
              ring
            />
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-slate-900">
                {getFullName(player.first_name, player.last_name)}
              </h2>
              <p className="text-sm leading-relaxed text-slate-500 mt-1">
                {player.high_school_name} • {player.city}, {player.state}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="primary">{player.primary_position}</Badge>
                <Badge variant="success">Class of {player.grad_year}</Badge>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {player.height_feet && player.height_inches && (
              <StatItem
                icon={<IconRuler size={16} />}
                label="Height"
                value={formatHeight(player.height_feet, player.height_inches)}
              />
            )}
            {player.weight_lbs && (
              <StatItem
                icon={<IconActivity size={16} />}
                label="Weight"
                value={`${player.weight_lbs} lbs`}
              />
            )}
            {player.exit_velo && (
              <StatItem
                icon={<IconTarget size={16} />}
                label="Exit Velo"
                value={`${player.exit_velo} mph`}
              />
            )}
            {player.pitch_velo && (
              <StatItem
                icon={<IconTarget size={16} />}
                label="Pitch Velo"
                value={`${player.pitch_velo} mph`}
              />
            )}
            {player.sixty_time && (
              <StatItem
                icon={<IconActivity size={16} />}
                label="60 Time"
                value={`${player.sixty_time}s`}
              />
            )}
            {player.gpa && (
              <StatItem
                icon={<IconGraduationCap size={16} />}
                label="GPA"
                value={player.gpa.toFixed(2)}
              />
            )}
          </div>

          {/* About */}
          {player.about_me && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">About</h3>
              <p className="text-sm leading-relaxed text-slate-600 line-clamp-4">{player.about_me}</p>
            </div>
          )}

          {/* Bats/Throws */}
          <div className="flex items-center gap-4 text-sm">
            {player.bats && (
              <div>
                <span className="text-slate-500">Bats:</span>{' '}
                <span className="font-medium text-slate-900">{player.bats}</span>
              </div>
            )}
            {player.throws && (
              <div>
                <span className="text-slate-500">Throws:</span>{' '}
                <span className="font-medium text-slate-900">{player.throws}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="primary"
              onClick={handleViewFullProfile}
              className="w-full"
            >
              <IconExternalLink size={16} className="mr-2" />
              View Full Profile
            </Button>
            <Button
              variant={isInWatchlist ? 'secondary' : 'secondary'}
              onClick={handleToggleWatchlist}
              disabled={watchlistLoading}
              className="w-full"
            >
              {isInWatchlist ? (
                <>
                  <IconStarFilled size={16} className="mr-2 text-green-600" />
                  Remove from Watchlist
                </>
              ) : (
                <>
                  <IconStar size={16} className="mr-2" />
                  Add to Watchlist
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-500">Player not found</p>
        </div>
      )}
    </PeekPanelRoot>
  );
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50">
      <div className="text-slate-500">{icon}</div>
      <div className="flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
