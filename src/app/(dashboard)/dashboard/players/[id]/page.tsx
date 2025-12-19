'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Loading } from '@/components/ui/loading';
import { BentoGrid, BentoCard, BentoStatCard } from '@/components/ui/bento-grid';
import { BadgeChip } from '@/components/ui/filter-chips';
import {
  IconArrowLeft,
  IconPlus,
  IconCheck,
  IconMail,
  IconPhone,
  IconMapPin,
  IconSchool,
  IconInstagram,
  IconTwitter,
  IconMessage,
  IconActivity,
  IconGraduationCap,
  IconRuler,
  IconTarget,
  IconVideo,
} from '@/components/icons';
import { usePlayer } from '@/hooks/use-players';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useAuth } from '@/hooks/use-auth';
import { cn, getFullName, formatHeight } from '@/lib/utils';
import { trackProfileView, trackContactClick } from '@/app/actions/engagement';

export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.id as string;
  const viewTrackedRef = useRef(false);

  const { user } = useAuth();
  const { player, loading } = usePlayer(playerId);
  const {
    isOnWatchlist,
    addToWatchlist,
    removeFromWatchlist
  } = useWatchlist();

  const onWatchlist = isOnWatchlist(playerId);

  // Track profile view once when page loads
  useEffect(() => {
    if (playerId && !viewTrackedRef.current && user?.role === 'coach') {
      viewTrackedRef.current = true;
      trackProfileView(playerId);
    }
  }, [playerId, user?.role]);

  const handleToggleWatchlist = async () => {
    if (onWatchlist) {
      await removeFromWatchlist(playerId);
    } else {
      await addToWatchlist(playerId);
    }
  };

  if (loading) {
    return (
      <>
        <Header title="Player Profile" />
        <Loading />
      </>
    );
  }

  if (!player) {
    return (
      <>
        <Header title="Player Profile" />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <IconTarget size={28} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Player not found</h3>
          <p className="text-sm text-slate-500 mb-4">
            This player profile may have been removed or doesn't exist.
          </p>
          <Button variant="secondary" onClick={() => router.back()}>
            Go Back
          </Button>
        </div>
      </>
    );
  }

  const name = getFullName(player.first_name, player.last_name);
  const height = formatHeight(player.height_feet, player.height_inches);
  const location = [player.city, player.state].filter(Boolean).join(', ');

  return (
    <>
      <Header title="Player Profile">
        <Button variant="ghost" onClick={() => router.back()}>
          <IconArrowLeft size={16} /> Back
        </Button>
      </Header>

      <div className="p-6 max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/50 p-8 mb-6">
          {/* Glow effect */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl" />

          <div className="relative z-10 flex items-start gap-8">
            {/* Avatar */}
            <div className="relative">
              <Avatar name={name} src={player.avatar_url} size="2xl" ring />
              {player.recruiting_activated && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-2 border-slate-900 flex items-center justify-center">
                  <IconCheck size={12} className="text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-white mb-2">{name}</h1>
                  <div className="flex items-center gap-3 mb-4">
                    <BadgeChip variant="success">{player.primary_position || 'Player'}</BadgeChip>
                    {player.secondary_position && (
                      <BadgeChip>{player.secondary_position}</BadgeChip>
                    )}
                    <span className="text-slate-400 text-sm">
                      Class of {player.grad_year || 'TBD'}
                    </span>
                  </div>

                  <div className="flex items-center gap-6 text-sm text-slate-400">
                    {player.high_school_name && (
                      <span className="flex items-center gap-1.5">
                        <IconSchool size={16} />
                        {player.high_school_name}
                      </span>
                    )}
                    {location && (
                      <span className="flex items-center gap-1.5">
                        <IconMapPin size={16} />
                        {location}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <Button
                    variant={onWatchlist ? 'secondary' : 'primary'}
                    onClick={handleToggleWatchlist}
                  >
                    {onWatchlist ? (
                      <><IconCheck size={16} /> On Watchlist</>
                    ) : (
                      <><IconPlus size={16} /> Add to Watchlist</>
                    )}
                  </Button>
                  <Button variant="secondary">
                    <IconMessage size={16} /> Message
                  </Button>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="flex items-center gap-8 mt-6 pt-6 border-t border-slate-700/50">
                {height && height !== '—' && (
                  <QuickStat label="Height" value={height} />
                )}
                {player.weight_lbs && (
                  <QuickStat label="Weight" value={`${player.weight_lbs} lbs`} />
                )}
                {player.bats && player.throws && (
                  <QuickStat label="B/T" value={`${player.bats}/${player.throws}`} />
                )}
                {player.pitch_velo && (
                  <QuickStat label="Pitch Velo" value={`${player.pitch_velo} mph`} highlight />
                )}
                {player.exit_velo && (
                  <QuickStat label="Exit Velo" value={`${player.exit_velo} mph`} highlight />
                )}
                {player.gpa && (
                  <QuickStat label="GPA" value={player.gpa.toString()} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bento Grid Layout */}
        <BentoGrid cols={4}>
          {/* About Card - Wide */}
          {player.about_me && (
            <BentoCard size="wide">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                About
              </h3>
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                {player.about_me}
              </p>
            </BentoCard>
          )}

          {/* Performance Metrics */}
          <BentoStatCard
            label="Pitch Velocity"
            value={player.pitch_velo ? `${player.pitch_velo}` : '—'}
            change={player.pitch_velo ? 'mph' : undefined}
            icon={<IconActivity size={20} />}
            iconBg="bg-green-100"
            iconColor="text-green-600"
          />

          <BentoStatCard
            label="Exit Velocity"
            value={player.exit_velo ? `${player.exit_velo}` : '—'}
            change={player.exit_velo ? 'mph' : undefined}
            icon={<IconTarget size={20} />}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
          />

          <BentoStatCard
            label="60-Yard Dash"
            value={player.sixty_time || '—'}
            change={player.sixty_time ? 'seconds' : undefined}
            icon={<IconRuler size={20} />}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
          />

          <BentoStatCard
            label="Pop Time"
            value={player.pop_time || '—'}
            change={player.pop_time ? 'seconds' : undefined}
            icon={<IconActivity size={20} />}
            iconBg="bg-purple-100"
            iconColor="text-purple-600"
          />

          {/* Academics Card */}
          <BentoCard size="wide">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Academics
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <p className="text-2xl font-bold text-slate-900">{player.gpa || '—'}</p>
                <p className="text-xs text-slate-500 mt-1">GPA</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <p className="text-2xl font-bold text-slate-900">{player.sat_score || '—'}</p>
                <p className="text-xs text-slate-500 mt-1">SAT</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <p className="text-2xl font-bold text-slate-900">{player.act_score || '—'}</p>
                <p className="text-xs text-slate-500 mt-1">ACT</p>
              </div>
            </div>
          </BentoCard>

          {/* Contact Card */}
          <BentoCard>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Contact
            </h3>
            <div className="space-y-3">
              {player.email && (
                <a
                  href={'mailto:' + player.email}
                  className="flex items-center gap-3 text-sm text-slate-600 hover:text-green-600 transition-colors"
                  onClick={() => trackContactClick(playerId, 'email')}
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <IconMail size={14} />
                  </div>
                  <span className="truncate">{player.email}</span>
                </a>
              )}
              {player.phone && (
                <a
                  href={'tel:' + player.phone}
                  className="flex items-center gap-3 text-sm text-slate-600 hover:text-green-600 transition-colors"
                  onClick={() => trackContactClick(playerId, 'phone')}
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <IconPhone size={14} />
                  </div>
                  {player.phone}
                </a>
              )}
              {!player.email && !player.phone && (
                <p className="text-sm text-slate-400 italic">No contact info provided</p>
              )}
            </div>
          </BentoCard>

          {/* Social Card */}
          {(player.instagram || player.twitter) && (
            <BentoCard>
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
                Social
              </h3>
              <div className="space-y-3">
                {player.instagram && (
                  <a
                    href={'https://instagram.com/' + player.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-slate-600 hover:text-pink-600 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center">
                      <IconInstagram size={14} className="text-white" />
                    </div>
                    @{player.instagram}
                  </a>
                )}
                {player.twitter && (
                  <a
                    href={'https://twitter.com/' + player.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-slate-600 hover:text-blue-500 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                      <IconTwitter size={14} className="text-white" />
                    </div>
                    @{player.twitter}
                  </a>
                )}
              </div>
            </BentoCard>
          )}

          {/* School Info Card */}
          <BentoCard>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              School Info
            </h3>
            <div className="space-y-3">
              <InfoRow label="High School" value={player.high_school_name || '—'} />
              {player.club_team && <InfoRow label="Club Team" value={player.club_team} />}
              <InfoRow label="Graduation" value={player.grad_year?.toString() || '—'} />
            </div>
          </BentoCard>

          {/* Videos Card - Placeholder */}
          <BentoCard size="wide" className="bg-slate-50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center">
                <IconVideo size={24} className="text-slate-400" />
              </div>
              <div>
                <h3 className="font-medium text-slate-900">Player Videos</h3>
                <p className="text-sm text-slate-500">View highlights and game film</p>
              </div>
              <div className="ml-auto">
                <Button variant="secondary" size="sm">
                  View All
                </Button>
              </div>
            </div>
          </BentoCard>
        </BentoGrid>
      </div>
    </>
  );
}

// Helper components
function QuickStat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className={cn(
        "text-lg font-semibold",
        highlight ? "text-green-400" : "text-white"
      )}>
        {value}
      </p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 font-medium">{value}</span>
    </div>
  );
}
