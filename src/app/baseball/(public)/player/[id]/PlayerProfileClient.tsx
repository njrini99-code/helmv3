'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  IconStar,
  IconStarFilled,
  IconMapPin,
  IconSchool,
  IconMail,
  IconPhone,
  IconBrandTwitter,
  IconBrandInstagram,
  IconVideo,
  IconTrendingUp,
  IconTrophy,
  IconUsers,
  IconCalendar,
  IconArrowLeft,
  IconCheck,
  IconEye,
  IconActivity,
  IconTarget,
  IconUser,
} from '@/components/icons';
import Image from 'next/image';
import { formatHeight, cn } from '@/lib/utils';
import { toggleWatchlistPlayer } from '@/app/baseball/actions/watchlist';
import { toast } from '@/components/ui/sonner';
import { Modal } from '@/components/ui/modal';
import { VideoPlayer } from '@/components/features/video-player';

interface PlayerSettings {
  show_videos?: boolean;
  show_dream_schools?: boolean;
  show_stats?: boolean;
  show_contact_email?: boolean;
  show_phone?: boolean;
  show_social_links?: boolean;
  [key: string]: unknown;
}

interface PlayerVideo {
  id: string;
  title: string;
  thumbnail_url: string | null;
  url: string | null;
  duration: number | null;
  is_primary: boolean;
  video_type: string | null;
  created_at: string;
  is_clip?: boolean | null;
  clip_start_time?: number | null;
  clip_end_time?: number | null;
}

interface RecruitingInterest {
  id: string;
  interest_level: string | null;
  organization: {
    id: string;
    name: string;
    division: string | null;
    logo_url: string | null;
  } | null;
}

interface PlayerStats {
  season?: string;
  batting_avg?: number;
  home_runs?: number | null;
  rbis?: number | null;
  stolen_bases?: number | null;
  era?: number;
  strikeouts?: number | null;
  fb_velo_avg?: number;
  [key: string]: unknown;
}

interface PlayerAchievement {
  id: string;
  achievement_text: string;
  achievement_type: string | null;
  achievement_date: string | null;
}

interface TeamMembership {
  id: string;
  joined_at: string | null;
  left_at: string | null;
  position: string | null;
  jersey_number: number | null;
  status: string | null;
  team: {
    id: string;
    name: string;
    team_type: string | null;
    organization: {
      id: string;
      name: string;
      type: string;
      logo_url: string | null;
      location_city: string | null;
      location_state: string | null;
    } | null;
  } | null;
}

interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  location_city?: string | null;
  location_state?: string | null;
  division?: string | null;
  conference?: string | null;
}

interface PlayerData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  about_me: string | null;
  city: string | null;
  state: string | null;
  high_school_name: string | null;
  email: string | null;
  phone: string | null;
  twitter: string | null;
  instagram: string | null;
  height_feet: number | null;
  height_inches: number | null;
  weight_lbs: number | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  bats: string | null;
  throws: string | null;
  gpa: number | null;
  sat_score: number | null;
  act_score: number | null;
  pitch_velo: number | null;
  exit_velo: number | null;
  sixty_time: number | null;
  recruiting_activated: boolean | null;
  committed_to: string | null;
  updated_at: string | null;
  player_settings: PlayerSettings | null;
  videos: PlayerVideo[];
  recruiting_interests: RecruitingInterest[];
  player_stats: PlayerStats[];
  player_achievements: PlayerAchievement[];
  team_members: TeamMembership[];
  high_school_org: Organization | null;
  committed_to_org: Organization | null;
  [key: string]: unknown;
}

interface PlayerProfileClientProps {
  player: PlayerData;
  isCoachViewing: boolean;
  initialIsInWatchlist: boolean;
  profileViewCount: number;
  watchlistCount: number;
}

type TabType = 'overview' | 'videos' | 'stats' | 'teams' | 'achievements';

export function PlayerProfileClient({
  player,
  isCoachViewing,
  initialIsInWatchlist,
  profileViewCount,
  watchlistCount,
}: PlayerProfileClientProps) {
  const router = useRouter();
  const [isInWatchlist, setIsInWatchlist] = useState(initialIsInWatchlist);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const settings = player.player_settings || {};
  const showVideos = settings.show_videos !== false;
  const showDreamSchools = settings.show_dream_schools !== false;
  const showStats = settings.show_stats !== false;
  const showContactEmail = settings.show_contact_email === true;
  const showPhone = settings.show_phone === true;
  const showSocial = settings.show_social_links !== false;

  const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
  const recruitingInterests = (player.recruiting_interests || [])
    .filter(ri => ri.organization)
    .slice(0, 5);

  const teamHistory = (player.team_members || [])
    .filter(tm => tm.team?.organization)
    .sort((a, b) => {
      const dateA = a.joined_at ? new Date(a.joined_at).getTime() : 0;
      const dateB = b.joined_at ? new Date(b.joined_at).getTime() : 0;
      return dateB - dateA;
    });

  const handleToggleWatchlist = () => {
    startTransition(async () => {
      const result = await toggleWatchlistPlayer(player.id);
      if (result.success) {
        setIsInWatchlist(result.action === 'added');
        toast.success(
          result.action === 'added' ? 'Added to watchlist' : 'Removed from watchlist'
        );
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to update watchlist');
      }
    });
  };

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: IconUser },
    { id: 'videos' as const, label: 'Videos', icon: IconVideo, count: player.videos?.length || 0 },
    { id: 'stats' as const, label: 'Stats & Metrics', icon: IconActivity },
    { id: 'teams' as const, label: 'Team History', icon: IconUsers, count: teamHistory.length },
    { id: 'achievements' as const, label: 'Awards', icon: IconTrophy, count: player.player_achievements?.length || 0 },
  ];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-warm-50 via-white to-primary-50/30">
      {/* Hero Header */}
      <div className="relative">
        {/* Background banner - custom image or premium gradient */}
        <div className="h-52 md:h-64 relative overflow-hidden">
          {player.banner_url ? (
            <>
              {/* Custom cover photo */}
              <Image
                src={player.banner_url}
                alt="Profile banner"
                fill
                className="absolute inset-0 w-full h-full object-cover"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/10" />
            </>
          ) : (
            <>
              {/* Premium gradient fallback */}
              <div className="absolute inset-0 bg-gradient-to-br from-warm-900 via-primary-900 to-primary-800" />
              <div className="absolute inset-0 bg-[url('/patterns/topography.svg')] opacity-[0.07]" />
              {/* Accent glow effects */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary-400/15 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </>
          )}

          {/* Back button */}
          <div className="absolute top-4 left-4 z-10">
            <Link
              href="/baseball/dashboard/discover"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors"
            >
              <IconArrowLeft size={18} />
              <span className="text-sm font-medium">Back to Discover</span>
            </Link>
          </div>

          {/* Actions on header */}
          {isCoachViewing && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              <Button
                variant={isInWatchlist ? 'secondary' : 'primary'}
                onClick={handleToggleWatchlist}
                disabled={isPending}
                className={cn(
                  "shadow-lg",
                  isInWatchlist
                    ? "bg-white text-primary-700 hover:bg-primary-50 active:bg-primary-100"
                    : "bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 border-white/30"
                )}
              >
                {isPending ? (
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                ) : isInWatchlist ? (
                  <IconStarFilled size={16} className="mr-2 text-primary-600" />
                ) : (
                  <IconStar size={16} className="mr-2" />
                )}
                {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </Button>
              <Button
                variant="secondary"
                className="bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors border-white/30"
              >
                <IconMail size={16} className="mr-2" />
                Message
              </Button>
            </div>
          )}
        </div>

        {/* Profile card overlapping banner */}
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 -mt-28 md:-mt-32 relative z-10">
          <div className="bg-white rounded-2xl shadow-xl border border-warm-200/50 overflow-hidden">
            <div className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  <div className="relative">
                    <Avatar
                      name={fullName}
                      src={player.avatar_url}
                      size="2xl"
                      className="ring-4 ring-white shadow-xl w-32 h-32 md:w-40 md:h-40"
                    />
                    {player.recruiting_activated && (
                      <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary-500 rounded-full border-4 border-white flex items-center justify-center shadow-lg">
                        <IconCheck size={16} className="text-white" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Player Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <h1 className="text-3xl md:text-4xl font-bold text-warm-900 tracking-tight">
                        {fullName}
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {player.primary_position && (
                          <span className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm font-semibold">
                            {player.primary_position}
                          </span>
                        )}
                        {player.secondary_position && (
                          <span className="px-3 py-1 bg-warm-100 text-warm-700 rounded-full text-sm font-medium">
                            {player.secondary_position}
                          </span>
                        )}
                        {player.grad_year && (
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                            Class of {player.grad_year}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick stats */}
                    <div className="flex items-center gap-6 text-center">
                      <div>
                        <div className="text-2xl font-bold text-warm-900">{profileViewCount}</div>
                        <div className="text-xs text-warm-500 uppercase tracking-wide">Views</div>
                      </div>
                      <div className="w-px h-10 bg-warm-200" />
                      <div>
                        <div className="text-2xl font-bold text-warm-900">{watchlistCount}</div>
                        <div className="text-xs text-warm-500 uppercase tracking-wide">Watchlists</div>
                      </div>
                      <div className="w-px h-10 bg-warm-200" />
                      <div>
                        <div className="text-2xl font-bold text-warm-900">{player.videos?.length || 0}</div>
                        <div className="text-xs text-warm-500 uppercase tracking-wide">Videos</div>
                      </div>
                    </div>
                  </div>

                  {/* Location, School & Teams */}
                  <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-warm-600">
                    {/* High School - either from org or plain text */}
                    {player.high_school_org ? (
                      <Link
                        href={`/baseball/program/${player.high_school_org.id}`}
                        className="flex items-center gap-2 hover:text-primary-600 transition-colors"
                      >
                        <IconSchool size={16} className="text-warm-400" />
                        <span className="hover:underline">{player.high_school_org.name}</span>
                      </Link>
                    ) : player.high_school_name && (
                      <div className="flex items-center gap-2">
                        <IconSchool size={16} className="text-warm-400" />
                        <span>{player.high_school_name}</span>
                      </div>
                    )}
                    {/* Active team memberships */}
                    {teamHistory
                      .filter(tm => tm.status === 'active' && tm.team?.organization)
                      .slice(0, 2)
                      .map((tm) => (
                        <Link
                          key={tm.id}
                          href={`/baseball/program/${tm.team!.organization!.id}`}
                          className="flex items-center gap-2 hover:text-primary-600 transition-colors"
                        >
                          <IconUsers size={16} className="text-warm-400" />
                          <span className="hover:underline">{tm.team!.organization!.name}</span>
                        </Link>
                      ))}
                    {player.city && player.state && (
                      <div className="flex items-center gap-2">
                        <IconMapPin size={16} className="text-warm-400" />
                        <span>{player.city}, {player.state}</span>
                      </div>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {player.recruiting_activated && (
                      <Badge className="bg-primary-500 text-white border-0">
                        Actively Recruiting
                      </Badge>
                    )}
                    {player.committed_to && player.committed_to_org && (
                      <Badge className="bg-blue-500 text-white border-0">
                        Committed to {player.committed_to_org.name}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-t border-warm-200 bg-warm-50/50">
              <div className="flex overflow-x-auto">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <Button variant="ghost"
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                        isActive
                          ? "border-primary-600 text-primary-600 bg-white"
                          : "border-transparent text-warm-600 hover:text-warm-900 hover:bg-white/50 active:bg-warm-50"
                      )}
                    >
                      <Icon size={18} />
                      <span>{tab.label}</span>
                      {tab.count !== undefined && tab.count > 0 && (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-xs",
                          isActive ? "bg-primary-100 text-primary-700" : "bg-warm-200 text-warm-600"
                        )}>
                          {tab.count}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'overview' && (
          <OverviewTab
            player={player}
            showDreamSchools={showDreamSchools}
            showContactEmail={showContactEmail}
            showPhone={showPhone}
            showSocial={showSocial}
            recruitingInterests={recruitingInterests}
            profileViewCount={profileViewCount}
            watchlistCount={watchlistCount}
          />
        )}

        {activeTab === 'videos' && showVideos && (
          <VideosTab videos={player.videos || []} />
        )}

        {activeTab === 'stats' && showStats && (
          <StatsTab player={player} />
        )}

        {activeTab === 'teams' && (
          <TeamsTab teamHistory={teamHistory} />
        )}

        {activeTab === 'achievements' && (
          <AchievementsTab achievements={player.player_achievements || []} />
        )}
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({
  player,
  showDreamSchools,
  showContactEmail,
  showPhone,
  showSocial,
  recruitingInterests,
  profileViewCount,
  watchlistCount,
}: {
  player: PlayerData;
  showDreamSchools: boolean;
  showContactEmail: boolean;
  showPhone: boolean;
  showSocial: boolean;
  recruitingInterests: RecruitingInterest[];
  profileViewCount: number;
  watchlistCount: number;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Content */}
      <div className="lg:col-span-2 space-y-6">
        {/* About */}
        {player.about_me && (
          <div className="bg-white rounded-2xl border border-warm-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-warm-900 mb-4">About</h2>
            <p className="text-warm-600 leading-relaxed whitespace-pre-wrap">
              {player.about_me}
            </p>
          </div>
        )}

        {/* Physical & Metrics */}
        <div className="bg-white rounded-2xl border border-warm-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-warm-900 mb-4 flex items-center gap-2">
            <IconActivity size={20} className="text-primary-600" />
            Physical & Metrics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {player.height_feet && player.height_inches && (
              <MetricCard label="Height" value={formatHeight(player.height_feet, player.height_inches)} />
            )}
            {player.weight_lbs && (
              <MetricCard label="Weight" value={`${player.weight_lbs} lbs`} />
            )}
            {player.bats && (
              <MetricCard label="Bats" value={player.bats} />
            )}
            {player.throws && (
              <MetricCard label="Throws" value={player.throws} />
            )}
            {player.pitch_velo && (
              <MetricCard label="Pitch Velo" value={`${player.pitch_velo} mph`} highlight="green" />
            )}
            {player.exit_velo && (
              <MetricCard label="Exit Velo" value={`${player.exit_velo} mph`} highlight="blue" />
            )}
            {player.sixty_time && (
              <MetricCard label="60 Time" value={`${player.sixty_time}s`} highlight="purple" />
            )}
            {player.gpa && (
              <MetricCard label="GPA" value={player.gpa.toFixed(2)} />
            )}
            {player.sat_score && (
              <MetricCard label="SAT" value={player.sat_score.toString()} />
            )}
            {player.act_score && (
              <MetricCard label="ACT" value={player.act_score.toString()} />
            )}
          </div>
        </div>

        {/* Featured Videos Preview */}
        {player.videos && player.videos.length > 0 && (
          <div className="bg-white rounded-2xl border border-warm-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-warm-900 flex items-center gap-2">
                <IconVideo size={20} className="text-primary-600" />
                Featured Videos
              </h2>
              <Button variant="ghost" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                View All ({player.videos.length})
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {player.videos.slice(0, 2).map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Contact Card */}
        {(showContactEmail || showPhone || showSocial) && (
          <div className="bg-white rounded-2xl border border-warm-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-warm-900 uppercase tracking-wide mb-4">
              Contact
            </h3>
            <div className="space-y-3">
              {showContactEmail && player.email && (
                <a
                  href={`mailto:${player.email}`}
                  className="flex items-center gap-3 p-3 bg-warm-50 rounded-xl text-sm text-warm-600 hover:bg-primary-50 active:bg-primary-100 hover:text-primary-700 transition-colors"
                >
                  <IconMail size={18} className="text-warm-400" />
                  <span className="truncate">{player.email}</span>
                </a>
              )}
              {showPhone && player.phone && (
                <a
                  href={`tel:${player.phone}`}
                  className="flex items-center gap-3 p-3 bg-warm-50 rounded-xl text-sm text-warm-600 hover:bg-primary-50 active:bg-primary-100 hover:text-primary-700 transition-colors"
                >
                  <IconPhone size={18} className="text-warm-400" />
                  <span>{player.phone}</span>
                </a>
              )}
              {showSocial && (player.twitter || player.instagram) && (
                <div className="flex gap-2 pt-2">
                  {player.twitter && (
                    <a
                      href={`https://twitter.com/${player.twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 p-3 bg-warm-50 rounded-xl text-sm text-warm-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      <IconBrandTwitter size={18} />
                    </a>
                  )}
                  {player.instagram && (
                    <a
                      href={`https://instagram.com/${player.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 p-3 bg-warm-50 rounded-xl text-sm text-warm-600 hover:bg-pink-50 hover:text-pink-600 transition-colors"
                    >
                      <IconBrandInstagram size={18} />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Schools of Interest */}
        {showDreamSchools && recruitingInterests.length > 0 && (
          <div className="bg-white rounded-2xl border border-warm-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-warm-900 uppercase tracking-wide mb-4 flex items-center gap-2">
              <IconTarget size={16} className="text-primary-600" />
              Schools of Interest
            </h3>
            <div className="space-y-2">
              {recruitingInterests.map((interest, idx) => (
                <div
                  key={interest.id}
                  className="flex items-center gap-3 p-3 bg-warm-50 rounded-xl hover:bg-warm-100 active:bg-warm-200 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-xs font-bold text-white">{idx + 1}</span>
                  </div>
                  {interest.organization?.logo_url ? (
                    <Image
                      src={interest.organization.logo_url}
                      alt={interest.organization.name}
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-lg object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-warm-200 flex items-center justify-center">
                      <IconSchool size={16} className="text-warm-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-warm-900 truncate">
                      {interest.organization?.name}
                    </p>
                    {interest.organization?.division && (
                      <p className="text-xs text-warm-500">{interest.organization.division}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Profile Activity */}
        <div className="bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl p-6 shadow-lg text-white">
          <h3 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-90">
            Profile Activity
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 opacity-90">
                <IconEye size={16} />
                <span className="text-sm">Profile Views</span>
              </div>
              <span className="text-xl font-bold">{profileViewCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 opacity-90">
                <IconStar size={16} />
                <span className="text-sm">On Watchlists</span>
              </div>
              <span className="text-xl font-bold">{watchlistCount}</span>
            </div>
            <div className="pt-2 border-t border-white/20">
              <div className="flex items-center justify-between text-sm opacity-75">
                <span>Last Updated</span>
                <span>
                  {player.updated_at
                    ? new Date(player.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Videos Tab Component
function VideosTab({ videos }: { videos: PlayerVideo[] }) {
  if (videos.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-warm-200 p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
          <IconVideo size={32} className="text-warm-400" />
        </div>
        <h3 className="text-lg font-medium text-warm-900 mb-2">No Videos Yet</h3>
        <p className="text-warm-500">This player hasn&apos;t uploaded any videos.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} large />
      ))}
    </div>
  );
}

// Stats Tab Component
function StatsTab({ player }: { player: PlayerData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Physical Stats */}
      <div className="bg-white rounded-2xl border border-warm-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-warm-900 mb-6 flex items-center gap-2">
          <IconTrendingUp size={20} className="text-primary-600" />
          Physical Profile
        </h2>
        <div className="space-y-4">
          <StatRow label="Height" value={player.height_feet && player.height_inches ? formatHeight(player.height_feet, player.height_inches) : '—'} />
          <StatRow label="Weight" value={player.weight_lbs ? `${player.weight_lbs} lbs` : '—'} />
          <StatRow label="Bats" value={player.bats || '—'} />
          <StatRow label="Throws" value={player.throws || '—'} />
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-2xl border border-warm-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-warm-900 mb-6 flex items-center gap-2">
          <IconActivity size={20} className="text-blue-600" />
          Performance Metrics
        </h2>
        <div className="space-y-4">
          <StatRow
            label="Pitch Velocity"
            value={player.pitch_velo ? `${player.pitch_velo} mph` : '—'}
            highlight={player.pitch_velo ? 'green' : undefined}
          />
          <StatRow
            label="Exit Velocity"
            value={player.exit_velo ? `${player.exit_velo} mph` : '—'}
            highlight={player.exit_velo ? 'blue' : undefined}
          />
          <StatRow
            label="60-Yard Dash"
            value={player.sixty_time ? `${player.sixty_time} sec` : '—'}
            highlight={player.sixty_time ? 'purple' : undefined}
          />
        </div>
      </div>

      {/* Academics */}
      <div className="bg-white rounded-2xl border border-warm-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-warm-900 mb-6 flex items-center gap-2">
          <IconSchool size={20} className="text-purple-600" />
          Academics
        </h2>
        <div className="space-y-4">
          <StatRow label="GPA" value={player.gpa ? player.gpa.toFixed(2) : '—'} />
          <StatRow label="SAT Score" value={player.sat_score?.toString() || '—'} />
          <StatRow label="ACT Score" value={player.act_score?.toString() || '—'} />
        </div>
      </div>

      {/* Player Info */}
      <div className="bg-white rounded-2xl border border-warm-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-warm-900 mb-6 flex items-center gap-2">
          <IconUser size={20} className="text-orange-600" />
          Player Info
        </h2>
        <div className="space-y-4">
          <StatRow label="Position" value={player.primary_position || '—'} />
          <StatRow label="Secondary" value={player.secondary_position || '—'} />
          <StatRow label="Class" value={player.grad_year?.toString() || '—'} />
          <StatRow label="Location" value={player.city && player.state ? `${player.city}, ${player.state}` : '—'} />
        </div>
      </div>
    </div>
  );
}

// Teams Tab Component
function TeamsTab({ teamHistory }: { teamHistory: TeamMembership[] }) {
  if (teamHistory.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-warm-200 p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
          <IconUsers size={32} className="text-warm-400" />
        </div>
        <h3 className="text-lg font-medium text-warm-900 mb-2">No Team History</h3>
        <p className="text-warm-500">This player hasn&apos;t added any team history.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-warm-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-warm-200 bg-warm-50/50">
        <h2 className="text-lg font-semibold text-warm-900 flex items-center gap-2">
          <IconUsers size={20} className="text-primary-600" />
          Team History
        </h2>
      </div>
      <div className="divide-y divide-warm-100">
        {teamHistory.map((membership) => {
          const org = membership.team?.organization;
          if (!org) return null;

          const joinDate = membership.joined_at
            ? new Date(membership.joined_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : null;
          const leftDate = membership.left_at
            ? new Date(membership.left_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : 'Present';

          return (
            <Link
              key={membership.id}
              href={`/baseball/program/${org.id}`}
              className="block p-6 hover:bg-warm-50/50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-14 h-14 rounded-xl flex items-center justify-center",
                  membership.status === 'active' ? "bg-primary-100" : "bg-warm-100"
                )}>
                  {org.logo_url ? (
                    <Image src={org.logo_url} alt={org.name} width={40} height={40} className="w-10 h-10 rounded-lg object-cover" unoptimized />
                  ) : (
                    <IconUsers size={24} className={membership.status === 'active' ? "text-primary-600" : "text-warm-400"} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-warm-900 group-hover:text-primary-600 transition-colors">
                      {membership.team?.name || org.name}
                    </p>
                    {membership.status === 'active' && (
                      <Badge className="bg-primary-100 text-primary-700 border-0 text-xs">Current</Badge>
                    )}
                  </div>
                  <p className="text-sm text-warm-500">
                    {org.name}
                    {org.location_city && org.location_state && ` • ${org.location_city}, ${org.location_state}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {membership.position && (
                      <span className="text-xs px-2 py-1 bg-warm-100 rounded-full text-warm-600 font-medium">
                        {membership.position}
                      </span>
                    )}
                    {membership.jersey_number && (
                      <span className="text-xs text-warm-500">#{membership.jersey_number}</span>
                    )}
                    {joinDate && (
                      <span className="text-xs text-warm-500 flex items-center gap-1">
                        <IconCalendar size={12} />
                        {joinDate} - {leftDate}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Achievements Tab Component
function AchievementsTab({ achievements }: { achievements: PlayerAchievement[] }) {
  if (achievements.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-warm-200 p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
          <IconTrophy size={32} className="text-warm-400" />
        </div>
        <h3 className="text-lg font-medium text-warm-900 mb-2">No Awards Yet</h3>
        <p className="text-warm-500">This player hasn&apos;t added any awards or achievements.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {achievements.map((achievement) => (
        <div
          key={achievement.id}
          className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6 shadow-sm"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg">
              <IconTrophy size={24} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-warm-900">{achievement.achievement_text}</p>
              <div className="flex items-center gap-2 mt-2">
                {achievement.achievement_type && (
                  <span className="text-xs px-2 py-1 bg-amber-100 rounded-full text-amber-700 font-medium">
                    {achievement.achievement_type}
                  </span>
                )}
                {achievement.achievement_date && (
                  <span className="text-xs text-warm-500">
                    {new Date(achievement.achievement_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Helper Components
function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: 'green' | 'blue' | 'purple' }) {
  const highlightClasses = {
    green: 'bg-gradient-to-br from-primary-50 to-primary-100 border-primary-200',
    blue: 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200',
    purple: 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200',
  };

  const valueClasses = {
    green: 'text-primary-700',
    blue: 'text-blue-700',
    purple: 'text-purple-700',
  };

  return (
    <div className={cn(
      "p-4 rounded-xl border",
      highlight ? highlightClasses[highlight] : "bg-warm-50 border-warm-200"
    )}>
      <p className="text-label font-semibold uppercase tracking-wider text-warm-500 mb-1">
        {label}
      </p>
      <p className={cn(
        "text-xl font-bold",
        highlight ? valueClasses[highlight] : "text-warm-900"
      )}>
        {value}
      </p>
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: 'green' | 'blue' | 'purple' }) {
  const highlightClasses = {
    green: 'text-primary-600 font-bold',
    blue: 'text-blue-600 font-bold',
    purple: 'text-purple-600 font-bold',
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-warm-100 last:border-0">
      <span className="text-sm text-warm-600">{label}</span>
      <span className={cn("text-sm font-semibold text-warm-900", highlight && highlightClasses[highlight])}>
        {value}
      </span>
    </div>
  );
}

function VideoCard({ video, large }: { video: PlayerVideo; large?: boolean }) {
  // Opens an in-page player instead of linking straight to the raw file in a
  // new tab — a clip row's `url` is the same file as its parent video, so a
  // bare link would play the whole parent unbounded. VideoPlayer's
  // clipStart/clipEnd props (the mechanism PR #665 built for the coach
  // dashboard's video library) clamp playback to the clip's own bounds.
  const [viewing, setViewing] = useState(false);

  return (
    <>
      {/* eslint-disable-next-line helm/no-raw-button -- full-bleed card is a single tap target */}
      <button
        type="button"
        onClick={() => setViewing(true)}
        aria-label={`Play ${video.title}`}
        className="group relative bg-white rounded-xl border border-warm-200 overflow-hidden hover:border-primary-300 hover:shadow-lg transition-all duration-300 w-full text-left"
      >
        {video.thumbnail_url ? (
          <div className={cn("relative", large ? "aspect-video" : "aspect-[16/10]")}>
            <Image
              src={video.thumbnail_url}
              alt={video.title}
              fill
              className="w-full h-full object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-xl">
                <div className="w-0 h-0 border-l-[18px] border-l-primary-600 border-y-[11px] border-y-transparent ml-1" />
              </div>
            </div>
            {video.is_primary && (
              <div className="absolute top-2 right-2">
                <Badge className="bg-primary-500 text-white border-0 text-xs shadow-lg">Featured</Badge>
              </div>
            )}
          </div>
        ) : (
          <div className={cn("bg-warm-100 flex items-center justify-center", large ? "aspect-video" : "aspect-[16/10]")}>
            <IconVideo size={40} className="text-warm-300" />
          </div>
        )}
        <div className="p-4">
          <p className="font-medium text-warm-900 truncate">{video.title}</p>
          <div className="flex items-center justify-between mt-1">
            {video.video_type && (
              <span className="text-xs text-warm-500">{video.video_type}</span>
            )}
            {video.duration && (
              <span className="text-xs text-warm-400">
                {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>
        </div>
      </button>

      <Modal open={viewing} onClose={() => setViewing(false)} title={video.title} size="xl">
        {video.url ? (
          <VideoPlayer
            src={video.url}
            thumbnail={video.thumbnail_url}
            title={video.title}
            autoPlay
            clipStart={video.clip_start_time ?? undefined}
            clipEnd={video.clip_end_time ?? undefined}
          />
        ) : (
          <p className="text-sm text-warm-500 text-center py-8">Video unavailable</p>
        )}
      </Modal>
    </>
  );
}
