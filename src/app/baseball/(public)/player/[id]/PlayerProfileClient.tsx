'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
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
  IconTrophy,
  IconUsers,
  IconCalendar,
  IconArrowLeft,
  IconCheck,
  IconEye,
  IconActivity,
  IconTarget,
  IconUser,
  IconChevronRight,
  IconPlay,
} from '@/components/icons';
import Image from 'next/image';
import { formatHeight, cn } from '@/lib/utils';
import { resolvePrivateProfileDisclosure } from '@/lib/baseball/recruiting-activation';
import { toggleWatchlistPlayer } from '@/app/baseball/actions/watchlist';
import { toast } from '@/components/ui/sonner';
import { Modal } from '@/components/ui/modal';
import { VideoPlayer } from '@/components/features/video-player';
import {
  Masthead,
  Eyebrow,
  HairlineRule,
  RuledStatLine,
  StatReadout,
  PaperCard,
  InkBadge,
  PositionChip,
  EditorsLetter,
  Reveal,
  HoverReveal,
  pressableClass,
} from '@/components/baseball/living-annual';

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
  player_achievements: PlayerAchievement[];
  team_members: TeamMembership[];
  high_school_org: Organization | null;
  committed_to_org: Organization | null;
  [key: string]: unknown;
}

interface PlayerProfileClientProps {
  player: PlayerData;
  isCoachViewing: boolean;
  /** True only when the viewer IS this player (the self-bypass path in
   *  resolvePublicProfileAccess — see conn-baseball-player Finding 4). */
  isSelfViewing: boolean;
  initialIsInWatchlist: boolean;
  profileViewCount: number;
  watchlistCount: number;
}

type TabType = 'overview' | 'videos' | 'stats' | 'teams' | 'achievements';

const TAB_ORDER: readonly TabType[] = ['overview', 'videos', 'stats', 'teams', 'achievements'];

/**
 * Second-person-free subject for every empty-state sentence on this page.
 *
 * This profile is read by parents, summer coaches and college staff who may
 * not know the athlete — "No data" or "This player hasn't…" tells them nothing
 * about WHOSE page is empty. Naming the athlete makes each empty state a
 * specific, honest statement instead of a generic shrug. Falls back to a
 * neutral noun when the record has no name at all (a legitimate state: the
 * masthead renders "Unknown Player" for the same row).
 */
function subjectName(first: string | null, last: string | null): string {
  return (first || last || '').trim() || 'This player';
}

// The hero's absolute-positioned back/action controls sit at the very top of
// the viewport with nothing above them — on notch/Dynamic Island devices a
// bare `top-4` clips under the status bar. `max()` keeps the same 1rem gap
// on ordinary phones while growing to clear the inset on notched ones (#482).
const HERO_SAFE_TOP_STYLE = {
  top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))',
};

// Mobile hero height (h-32) and passport-card overlap (-mt-2) below are a
// matched pair, re-derived (PR #818 review) to clear the coach action row
// even in the worst case, not just the ordinary case:
//   - src/app/layout.tsx sets viewportFit:'cover', so
//     env(safe-area-inset-top) is a LIVE value, not 0 — up to ~59px on
//     current Dynamic-Island iPhones (14/15/16 Pro) in portrait.
//   - HERO_SAFE_TOP_STYLE's top at that inset = max(16px, 59+8) = 67px.
//   - The Watchlist <Button> is `min-h-[44px]`, so its bottom edge lands at
//     67 + 44 = 111px from the hero's top in the worst case.
//   - The passport card's top edge is safe-area-INDEPENDENT: hero height
//     minus overlap. It must stay >= ~111px with margin, so on mobile that's
//     128px (h-32) - 8px (-mt-2) = 120px — 9px of real clearance below the
//     action row even on a Dynamic Island phone.
// Do not shrink either number without re-checking this arithmetic — a
// smaller hero and/or bigger overlap reintroduces the tap-target-clipping
// bug this comment documents.

export function PlayerProfileClient({
  player,
  isCoachViewing,
  isSelfViewing,
  initialIsInWatchlist,
  profileViewCount,
  watchlistCount,
}: PlayerProfileClientProps) {
  const router = useRouter();
  const [isInWatchlist, setIsInWatchlist] = useState(initialIsInWatchlist);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  // Roving-tabindex focus targets for the tab strip (WAI-ARIA `tabs` pattern):
  // only the selected tab is in the page tab-order, and Arrow/Home/End move
  // focus between them. Fairway's <Segmented> gives this for free but CANNOT
  // be used on this route — see the note above the tab strip below.
  const tabRefs = useRef<Partial<Record<TabType, HTMLButtonElement | null>>>({});

  const settings = player.player_settings || {};
  const showVideos = settings.show_videos !== false;
  const showDreamSchools = settings.show_dream_schools !== false;
  const showStats = settings.show_stats !== false;
  const showContactEmail = settings.show_contact_email === true;
  const showPhone = settings.show_phone === true;
  const showSocial = settings.show_social_links !== false;

  const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
  const displayName = subjectName(player.first_name, player.last_name);
  const videoCount = player.videos?.length ?? 0;
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

  // History-aware back navigation (#482) — a shared recruiting link can be
  // opened cold (no history) from anywhere, so a hardcoded Discover target
  // was wrong for self-viewing players and anonymous/public visitors alike.
  // Same defensive pattern as BackChevron in src/components/ui/page-header.tsx.
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    if (isCoachViewing) {
      // Command Center, not Discover. Discover is a recruiting route and
      // recruiting is sunset (product-modules.ts), so
      // requireRecruitingCoachRoute now bounces every coach off /discover to
      // /command-center — sending them there first only costs a round trip
      // and flashes a route they can no longer use.
      router.push('/baseball/dashboard/command-center');
    } else if (isSelfViewing) {
      router.push('/baseball/player/today');
    } else {
      router.push('/');
    }
  };

  // Copy + CTA for the self-view privacy notice below, resolved through the
  // recruiting module gate rather than hardcoded here.
  const selfViewDisclosure = resolvePrivateProfileDisclosure();

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: IconUser },
    // The count is itself protected data: publishing "Videos 7" next to a tab
    // that then says "video is private" discloses exactly what the player
    // asked us to withhold. Omit the badge entirely when show_videos is off —
    // an absent count reveals nothing, a zero would be a lie.
    { id: 'videos' as const, label: 'Videos', icon: IconVideo, count: showVideos ? videoCount : undefined },
    { id: 'stats' as const, label: 'Stats & Metrics', icon: IconActivity },
    { id: 'teams' as const, label: 'Team History', icon: IconUsers, count: teamHistory.length },
    { id: 'achievements' as const, label: 'Awards', icon: IconTrophy, count: player.player_achievements?.length || 0 },
  ];

  // Arrow/Home/End roving focus for the tab strip. Selection follows focus,
  // which is the correct WAI-ARIA behavior for tabs whose panels are already
  // rendered client-side (no fetch cost per tab change).
  const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, current: TabType) => {
    const index = TAB_ORDER.indexOf(current);
    // `undefined`, not `null` — TAB_ORDER is indexed under
    // noUncheckedIndexedAccess, which types every lookup as `TabType | undefined`.
    let next: TabType | undefined;
    if (event.key === 'ArrowRight') next = TAB_ORDER[(index + 1) % TAB_ORDER.length];
    else if (event.key === 'ArrowLeft') next = TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length];
    else if (event.key === 'Home') next = TAB_ORDER[0];
    else if (event.key === 'End') next = TAB_ORDER[TAB_ORDER.length - 1];
    if (!next) return;
    event.preventDefault();
    setActiveTab(next);
    // .focus() also scrolls the newly-focused tab into view inside the
    // horizontally-scrolling strip, so keyboard users never focus an
    // off-screen tab.
    tabRefs.current[next]?.focus();
  }, []);

  const hometown = player.city && player.state ? `${player.city}, ${player.state}` : null;

  return (
    <div className="min-h-dvh bg-[var(--paper-canvas)]">
      {/* Hero Header */}
      <div className="relative">
        {/* Background banner - custom image or a graphite/clay editorial fallback.
            The dark-scrim photo-hero overlay pattern (bg-black/50 controls +
            bottom-anchored gradient) is preserved verbatim from the prior fix —
            it's the one place on this page that intentionally isn't cream/paper. */}
        <div className="h-32 sm:h-36 md:h-64 relative overflow-hidden">
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
              {/* Graphite editorial fallback — two-ink (graphite + a faint clay
                  glow), never the reserved --clay viz token and never the green
                  team-ink (this surface is the recruiting/pursuit lane). */}
              <div
                className="absolute inset-0"
                style={{ backgroundImage: 'linear-gradient(135deg, #1C1A17 0%, #2B2117 55%, #1C1A17 100%)' }}
              />
              <div className="absolute inset-0 bg-[url('/patterns/topography.svg')] opacity-[0.06]" />
              <div
                className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"
                style={{ backgroundColor: 'color-mix(in oklch, var(--pursuit-ink) 22%, transparent)' }}
              />
              <div
                className="absolute bottom-0 left-0 w-64 h-64 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"
                style={{ backgroundColor: 'color-mix(in oklch, var(--pursuit-deep) 20%, transparent)' }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </>
          )}

          {/* Back button — history-aware, safe-area-clamped (#482) */}
          <div className="absolute left-4 z-10" style={HERO_SAFE_TOP_STYLE}>
            {/* eslint-disable-next-line helm/no-raw-button -- history-aware back control needs onClick, not a navigable <Link> (#482) */}
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <IconArrowLeft size={18} />
              <span className="text-sm font-medium">Back</span>
            </button>
          </div>

          {/* Actions on header — exactly ONE coach CTA (Watchlist).
              There used to be a second "Message" CTA at md+ plus a phone-only
              overflow menu holding a duplicate of it. Neither had an onClick
              or an href: the desktop pill was inert and the menu item only
              closed its own menu. There is no compose-to-player route to point
              them at (/baseball/dashboard/messages has no recipient deeplink),
              so they were removed rather than wired to a dead end — an
              affordance that does nothing on the product's most-shared page is
              worse than an absent one. Removing them also retires the whole
              overflow-menu apparatus (state, blur-dismiss, Escape handling).

              Below md, Watchlist stays icon-only (aria-labelled): at 320px the
              back button (left-4) and a full "Add to Watchlist" label pill
              (right-4) overlapped by ~28px, since the label pill alone runs
              ~184px wide against a ~280px right-side budget. Icon-only shrinks
              it to ~56px, clearing the back button at every target width. */}
          {isCoachViewing && (
            <div className="absolute right-4 z-10 flex items-center gap-2" style={HERO_SAFE_TOP_STYLE}>
              <Button
                variant={isInWatchlist ? 'secondary' : 'primary'}
                onClick={handleToggleWatchlist}
                disabled={isPending}
                aria-busy={isPending}
                aria-label={
                  isPending
                    ? 'Updating watchlist'
                    : isInWatchlist
                      ? 'In Watchlist'
                      : 'Add to Watchlist'
                }
                className={cn(
                  "shadow-lg px-3 md:px-5",
                  isInWatchlist
                    ? "bg-[var(--paper)] text-pursuit hover:bg-pursuit/10 active:bg-pursuit/15"
                    : "bg-black/50 text-white hover:bg-black/70"
                )}
              >
                {isPending ? (
                  // motion-reduce:animate-none — the ring still reads as a
                  // distinct "busy" glyph when it isn't spinning, and the
                  // aria-label + aria-busy above carry the state for anyone
                  // who can't see it at all.
                  <div className="animate-spin motion-reduce:animate-none h-4 w-4 border-2 border-current border-t-transparent rounded-full md:mr-2" />
                ) : isInWatchlist ? (
                  <IconStarFilled size={16} className="md:mr-2 text-pursuit" />
                ) : (
                  <IconStar size={16} className="md:mr-2" />
                )}
                <span className="hidden md:inline">{isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}</span>
              </Button>
            </div>
          )}
        </div>

        {/* Passport card overlapping banner */}
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 -mt-2 sm:-mt-10 md:-mt-32 relative z-10">
          <PaperCard registrationTick className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Avatar */}
              <div className="flex-shrink-0">
                <div className="relative">
                  <Avatar
                    name={fullName}
                    src={player.avatar_url}
                    size="2xl"
                    className="ring-4 ring-[color:var(--paper)] shadow-xl w-20 h-20 md:w-40 md:h-40"
                  />
                  {player.recruiting_activated && (
                    <div className="absolute -bottom-1 -right-1 h-6 w-6 md:h-8 md:w-8 bg-pursuit rounded-full border-4 border-[color:var(--paper)] flex items-center justify-center shadow-lg">
                      <IconCheck size={14} className="text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Masthead + info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <Masthead
                    given={player.first_name ?? ''}
                    surname={player.last_name || (player.first_name ? '' : 'Unknown Player')}
                    dateline={
                      <Eyebrow
                        ink="pursuit"
                        items={[
                          player.primary_position,
                          player.secondary_position,
                          player.grad_year ? `Class of ${player.grad_year}` : null,
                          hometown,
                        ]}
                      />
                    }
                    ink="pursuit"
                    accentRule
                  />

                  {/* Quick stats. gap-y is smaller than gap-x on purpose: at
                      320px the passport's inner width is ~240px, so this row
                      wraps to two lines and needs vertical rhythm that doesn't
                      look like a gap in the layout. */}
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-4 md:gap-10">
                    <RuledStatLine label="Views" value={profileViewCount} ink="pursuit" size="row" />
                    <RuledStatLine label="Watchlists" value={watchlistCount} ink="pursuit" size="row" />
                    {/* Same disclosure rule as the Videos tab badge: a video
                        count is protected by show_videos, so it is omitted
                        (not zeroed) when the player has video set to private. */}
                    {showVideos && (
                      <RuledStatLine label="Videos" value={videoCount} ink="pursuit" size="row" />
                    )}
                  </div>
                </div>

                {/* Location, School & Teams */}
                <div className="flex flex-wrap items-center gap-4 mt-5 font-annual text-body-sm text-text-secondary">
                  {/* High School - either from org or plain text */}
                  {player.high_school_org ? (
                    <Link
                      href={`/baseball/program/${player.high_school_org.id}`}
                      className="flex items-center gap-2 hover:text-pursuit transition-colors"
                    >
                      <IconSchool size={16} className="text-text-tertiary" />
                      <span className="hover:underline">{player.high_school_org.name}</span>
                    </Link>
                  ) : player.high_school_name && (
                    <div className="flex items-center gap-2">
                      <IconSchool size={16} className="text-text-tertiary" />
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
                        className="flex items-center gap-2 hover:text-pursuit transition-colors"
                      >
                        <IconUsers size={16} className="text-text-tertiary" />
                        <span className="hover:underline">{tm.team!.organization!.name}</span>
                      </Link>
                    ))}
                  {player.city && player.state && (
                    <div className="flex items-center gap-2">
                      <IconMapPin size={16} className="text-text-tertiary" />
                      <span>{player.city}, {player.state}</span>
                    </div>
                  )}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {player.recruiting_activated && (
                    <InkBadge label="Actively Recruiting" tone="pursuit" variant="solid" />
                  )}
                  {player.committed_to && player.committed_to_org && (
                    <InkBadge label={`Committed to ${player.committed_to_org.name}`} tone="pursuit" variant="solid" />
                  )}
                </div>
              </div>
            </div>

            <HairlineRule ink="hairline" className="my-6" />

            {/* Tabs.
                NOT Fairway's <Segmented>, deliberately. The `(public)` route
                group mounts <LazyMotion strict> (PublicMotionScope.tsx) so
                signed-out visitors get the Living Annual entrance animations;
                `strict` makes framer-motion THROW on any descendant that
                renders a full `motion.*` component. segmented.tsx renders
                <motion.span> for its sliding pill, so dropping it in here
                would crash the product's most-shared page for every visitor
                who does not have prefers-reduced-motion on. The strip below is
                built from Living Annual atoms (InkBadge + pressableClass) and
                implements the same WAI-ARIA `tabs` keyboard contract Segmented
                would have provided (roving tabindex + Arrow/Home/End).

                min-w-0 lets the strip scroll horizontally inside the passport
                card instead of widening it and pushing the whole page into a
                horizontal scroll on narrow phones. */}
            <div
              className="flex min-w-0 gap-1.5 overflow-x-auto pb-1"
              role="tablist"
              aria-label="Player sections"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  // eslint-disable-next-line helm/no-raw-button -- tab strip needs its own compact hit target, not <Button>'s fixed min-height
                  <button
                    type="button"
                    key={tab.id}
                    ref={(node) => {
                      tabRefs.current[tab.id] = node;
                    }}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`pp-panel-${tab.id}`}
                    id={`pp-tab-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-fw-lg px-3 py-2',
                      // Coarse pointers get the WCAG 2.2 AA (2.5.8) 44px target;
                      // this strip is tapped far more often than it is clicked.
                      '[@media(pointer:coarse)]:min-h-[44px]',
                      pressableClass({ ink: 'pursuit' })
                    )}
                  >
                    <Icon size={15} className={isActive ? 'text-pursuit' : 'text-text-tertiary'} />
                    <InkBadge label={tab.label} tone={isActive ? 'pursuit' : 'neutral'} variant={isActive ? 'solid' : 'soft'} />
                    {tab.count !== undefined && tab.count > 0 && (
                      <InkBadge label={String(tab.count)} tone="neutral" variant="soft" />
                    )}
                  </button>
                );
              })}
            </div>
          </PaperCard>
        </div>
      </div>

      {/* Self-view invisibility disclosure (Finding 4) — the self-bypass in
          resolvePublicProfileAccess skips every visibility check for the
          profile's own player, so without this notice a player could believe
          this page is what recruiters see when recruiting is actually off
          and nobody else can reach it at all. */}
      {isSelfViewing && !player.recruiting_activated && (
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 mt-6">
          <EditorsLetter
            ink="pursuit"
            title="Only you can see this page right now"
            // Unlike the other three activation surfaces this notice is NOT
            // hidden by the sunset — the fact it discloses stays true, and
            // stays load-bearing, because the self-bypass above means a player
            // would otherwise take this page for what recruiters see. Only the
            // explanation and the call to action change: the old body said
            // exposure "is off", which invites the reader to go turn it on, and
            // that is not a choice available to them right now.
            body={selfViewDisclosure.body}
            action={
              selfViewDisclosure.showActivateCta ? (
                <Link
                  href="/baseball/dashboard/activate"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-pursuit px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
                >
                  Activate Recruiting
                  <IconChevronRight size={16} />
                </Link>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Tab Content */}
      <div
        className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8"
        role="tabpanel"
        id={`pp-panel-${activeTab}`}
        aria-labelledby={`pp-tab-${activeTab}`}
        // Focusable so a keyboard user leaving the tab strip lands in the
        // panel they just selected rather than skipping past it. Panels vary
        // between "has links" (Team History) and "has none" (Stats), so this
        // is unconditional instead of content-dependent.
        tabIndex={0}
      >
        {activeTab === 'overview' && (
          <OverviewTab
            player={player}
            displayName={displayName}
            showStats={showStats}
            showVideos={showVideos}
            showDreamSchools={showDreamSchools}
            showContactEmail={showContactEmail}
            showPhone={showPhone}
            showSocial={showSocial}
            recruitingInterests={recruitingInterests}
            profileViewCount={profileViewCount}
            watchlistCount={watchlistCount}
          />
        )}

        {activeTab === 'videos' && (
          showVideos ? (
            <VideosTab videos={player.videos || []} displayName={displayName} />
          ) : (
            <EditorsLetter
              ink="pursuit"
              title="Video is set to private"
              body={`${displayName} has turned video off for their public profile. Everything else on this page is still visible.`}
            />
          )
        )}

        {activeTab === 'stats' && (
          showStats ? (
            <StatsTab player={player} displayName={displayName} />
          ) : (
            <EditorsLetter
              ink="pursuit"
              title="Measurables are set to private"
              body={`${displayName} has turned off height, weight, velocities and academics for their public profile. Everything else on this page is still visible.`}
            />
          )
        )}

        {activeTab === 'teams' && (
          <TeamsTab teamHistory={teamHistory} displayName={displayName} />
        )}

        {activeTab === 'achievements' && (
          <AchievementsTab achievements={player.player_achievements || []} displayName={displayName} />
        )}
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({
  player,
  displayName,
  showStats,
  showVideos,
  showDreamSchools,
  showContactEmail,
  showPhone,
  showSocial,
  recruitingInterests,
  profileViewCount,
  watchlistCount,
}: {
  player: PlayerData;
  displayName: string;
  /** baseball_player_settings.show_stats — gates the measurable stack below. */
  showStats: boolean;
  /** baseball_player_settings.show_videos — gates the featured-video preview. */
  showVideos: boolean;
  showDreamSchools: boolean;
  showContactEmail: boolean;
  showPhone: boolean;
  showSocial: boolean;
  recruitingInterests: RecruitingInterest[];
  profileViewCount: number;
  watchlistCount: number;
}) {
  // The passport measurable stack — every field always renders; a missing
  // measurable ghosts at 40% instead of vanishing, so the profile literally
  // "fills in" as the player records more of themselves (spec north-star #1).
  // These are all self-reported by the player, so none of them wear the
  // `verified` ON THE RECORD check — presence isn't verification. That check
  // is reserved for a real verification signal (e.g. combine/coach-attested
  // data) once one exists.
  const measurables: Array<{
    label: string;
    value: string;
    unit?: string;
    ghost: boolean;
  }> = [
    {
      label: 'Height',
      value: player.height_feet && player.height_inches != null ? formatHeight(player.height_feet, player.height_inches) : '',
      ghost: !(player.height_feet && player.height_inches != null),
    },
    { label: 'Weight', value: player.weight_lbs ? String(player.weight_lbs) : '', unit: player.weight_lbs ? 'LBS' : undefined, ghost: !player.weight_lbs },
    { label: 'Bats', value: player.bats ?? '', ghost: !player.bats },
    { label: 'Throws', value: player.throws ?? '', ghost: !player.throws },
    {
      label: 'Pitch Velo',
      value: player.pitch_velo != null ? String(player.pitch_velo) : '',
      unit: player.pitch_velo != null ? 'MPH' : undefined,
      ghost: player.pitch_velo == null,
    },
    {
      label: 'Exit Velo',
      value: player.exit_velo != null ? String(player.exit_velo) : '',
      unit: player.exit_velo != null ? 'MPH' : undefined,
      ghost: player.exit_velo == null,
    },
    {
      label: '60 Time',
      value: player.sixty_time != null ? String(player.sixty_time) : '',
      unit: player.sixty_time != null ? 'SEC' : undefined,
      ghost: player.sixty_time == null,
    },
    { label: 'GPA', value: player.gpa != null ? player.gpa.toFixed(2) : '', ghost: player.gpa == null },
    { label: 'SAT', value: player.sat_score != null ? player.sat_score.toString() : '', ghost: player.sat_score == null },
    { label: 'ACT', value: player.act_score != null ? player.act_score.toString() : '', ghost: player.act_score == null },
  ];

  // VISIBILITY GATES. show_stats / show_videos were previously enforced only on
  // the Stats and Videos TABS — Overview rendered the same measurables (height,
  // weight, velocities, GPA/SAT/ACT) and the same video thumbnails regardless,
  // so a player who set either to private still had that data published on the
  // tab this page opens on. Gate them here at the source; see the tab strip for
  // the matching count suppression.
  const featuredVideos = showVideos ? (player.videos ?? []).slice(0, 2) : [];
  // Nothing to read at all: no bio, measurables withheld or unrecorded, no
  // playable video. Say so once, plainly, instead of leaving a column of
  // headers over empty space.
  const hasRecordedMeasurable = measurables.some((m) => !m.ghost);
  const mainColumnIsEmpty =
    !player.about_me && featuredVideos.length === 0 && (!showStats || !hasRecordedMeasurable);

  // WITHHELD is not the same fact as NOT RECORDED, and the page must never
  // claim the wrong one.
  //
  // The first version of this copy branched on `showStats` alone, so a player
  // who set their VIDEO to private got a public page asserting "nothing is
  // hidden, there just isn't anything on the record so far" — a statement
  // about their privacy choices that was false, on their own profile, to
  // anyone who visited. Both flags decide it now.
  //
  // Note the asymmetry with the server: page.tsx redacts withheld fields
  // before they are serialized, so this component cannot tell "private" from
  // "absent" by looking at the data. It has to be told, which is exactly why
  // the settings are still threaded through after the redaction.
  const somethingIsWithheld = !showStats || !showVideos;
  const emptyColumnExplanation = (() => {
    if (!showStats && !showVideos) {
      return `${displayName} has set both their measurables and their video to private, so there's nothing to read on this tab. Team history and awards are still on the tabs above.`;
    }
    if (!showStats) {
      return `${displayName} has set their measurables to private, and hasn't published any video yet. Team history and awards are still on the tabs above.`;
    }
    if (!showVideos) {
      return `${displayName} has set their video to private, and hasn't recorded a height, weight, velocity or test score yet. As each one is added it appears here.`;
    }
    return `${displayName} hasn't recorded a height, weight, velocity, test score or video yet. As each one is added it appears here — nothing is hidden, there just isn't anything on the record so far.`;
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Content */}
      <div className="lg:col-span-2 space-y-6">
        {/* About */}
        {player.about_me && (
          <PaperCard className="p-6">
            <Eyebrow ink="pursuit" className="mb-4">About</Eyebrow>
            <p className="font-annual text-body-lg leading-relaxed text-text-secondary whitespace-pre-wrap">
              {player.about_me}
            </p>
          </PaperCard>
        )}

        {mainColumnIsEmpty && (
          <EditorsLetter
            ink="pursuit"
            title={
              somethingIsWithheld
                ? 'Parts of this profile are private'
                : 'This profile is still being filled in'
            }
            body={emptyColumnExplanation}
          />
        )}

        {/* Physical & Metrics.
            When stats are visible but nothing is recorded AND the column is
            not otherwise empty (a bio or a video carries it), this section
            used to vanish with no notice at all — a sixth empty state nobody
            wrote copy for. Say it instead of showing a gap. */}
        {showStats && !hasRecordedMeasurable && !mainColumnIsEmpty && (
          <PaperCard className="p-6">
            <div className="mb-3 flex items-center gap-2">
              <IconActivity size={18} className="text-pursuit" />
              <Eyebrow ink="pursuit">Physical &amp; Metrics</Eyebrow>
            </div>
            <p className="font-annual text-body text-text-secondary">
              No height, weight, velocity or test score has been recorded yet. Each one appears
              here as it is added.
            </p>
          </PaperCard>
        )}

        {showStats && hasRecordedMeasurable && (
          <PaperCard className="p-6">
            <div className="mb-5 flex items-center gap-2">
              <IconActivity size={18} className="text-pursuit" />
              <Eyebrow ink="pursuit">Physical &amp; Metrics</Eyebrow>
            </div>
            {/* Two columns from 320px up, not one: these values are short
                (6'2", 185, 6.8, 1280) and a ten-row single-column stack of
                40px numerals pushed the rest of the profile a full screen
                down on a phone — the device this link is opened on most. */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 sm:gap-x-8 lg:grid-cols-4">
              {measurables.map((m, i) => (
                <Reveal key={m.label} staggerIndex={Math.min(i, 8)}>
                  <RuledStatLine
                    label={m.label}
                    value={m.ghost ? '' : m.value}
                    unit={m.unit}
                    ghost={m.ghost}
                    ink="pursuit"
                    size="row"
                  />
                </Reveal>
              ))}
            </div>
          </PaperCard>
        )}

        {/* Featured Videos Preview */}
        {featuredVideos.length > 0 && (
          <PaperCard className="p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex min-w-0 items-center gap-2">
                <IconVideo size={18} className="text-pursuit" />
                <Eyebrow ink="pursuit">Featured Videos</Eyebrow>
              </div>
              <span className="shrink-0 font-annual text-body-sm font-medium text-pursuit">
                {player.videos.length} total
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {featuredVideos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          </PaperCard>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Contact Card */}
        {(showContactEmail || showPhone || showSocial) && (
          <PaperCard className="p-6">
            <Eyebrow ink="pursuit" className="mb-4">Contact</Eyebrow>
            <div className="space-y-3">
              {showContactEmail && player.email && (
                <a
                  href={`mailto:${player.email}`}
                  className={cn(
                    'flex items-center gap-3 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3 font-annual text-body-sm text-text-secondary',
                    pressableClass({ ink: 'pursuit' })
                  )}
                >
                  <IconMail size={18} className="text-text-tertiary" />
                  <span className="truncate">{player.email}</span>
                </a>
              )}
              {showPhone && player.phone && (
                <a
                  href={`tel:${player.phone}`}
                  className={cn(
                    'flex items-center gap-3 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3 font-annual text-body-sm text-text-secondary',
                    pressableClass({ ink: 'pursuit' })
                  )}
                >
                  <IconPhone size={18} className="text-text-tertiary" />
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
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3 text-text-secondary',
                        pressableClass({ ink: 'pursuit' })
                      )}
                    >
                      <IconBrandTwitter size={18} />
                    </a>
                  )}
                  {player.instagram && (
                    <a
                      href={`https://instagram.com/${player.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3 text-text-secondary',
                        pressableClass({ ink: 'pursuit' })
                      )}
                    >
                      <IconBrandInstagram size={18} />
                    </a>
                  )}
                </div>
              )}
            </div>
          </PaperCard>
        )}

        {/* Schools of Interest */}
        {showDreamSchools && recruitingInterests.length > 0 && (
          <PaperCard className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <IconTarget size={16} className="text-pursuit" />
              <Eyebrow ink="pursuit">Schools of Interest</Eyebrow>
            </div>
            <div className="space-y-2">
              {recruitingInterests.map((interest, idx) => {
                const org = interest.organization;
                const rowContent = (
                  <>
                    <div className="w-7 h-7 rounded-full bg-pursuit flex items-center justify-center flex-shrink-0">
                      <span className="font-annual text-eyebrow font-bold text-white">{idx + 1}</span>
                    </div>
                    {org?.logo_url ? (
                      <Image
                        src={org.logo_url}
                        alt={org.name}
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-lg object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg border border-[color:var(--hairline)] bg-[var(--paper)] flex items-center justify-center">
                        <IconSchool size={16} className="text-text-tertiary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-annual text-body-sm font-medium text-text-primary truncate">
                        {org?.name}
                      </p>
                      {org?.division && (
                        <p className="text-eyebrow text-text-tertiary">{org.division}</p>
                      )}
                    </div>
                  </>
                );

                // Rows visually signal tappability (pressableClass); make that
                // true by linking out to the school's program profile, same
                // as the identity-chip links elsewhere on this page. A row
                // with no organization record has nowhere to go, so it stays
                // a plain non-interactive div.
                if (org) {
                  return (
                    <Link
                      key={interest.id}
                      href={`/baseball/program/${org.id}`}
                      className={cn(
                        'flex items-center gap-3 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3',
                        pressableClass({ ink: 'pursuit' })
                      )}
                    >
                      {rowContent}
                    </Link>
                  );
                }

                return (
                  <div
                    key={interest.id}
                    className="flex items-center gap-3 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3"
                  >
                    {rowContent}
                  </div>
                );
              })}
            </div>
          </PaperCard>
        )}

        {/* Profile Activity */}
        <PaperCard className="p-6">
          <Eyebrow ink="pursuit" className="mb-4">Profile Activity</Eyebrow>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-text-tertiary">
                <IconEye size={16} />
                <span className="font-annual text-body-sm">Profile Views</span>
              </div>
              <StatReadout value={profileViewCount} className="text-h3" ariaLabel="Profile views" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-text-tertiary">
                <IconStar size={16} />
                <span className="font-annual text-body-sm">On Watchlists</span>
              </div>
              <StatReadout value={watchlistCount} className="text-h3" ariaLabel="On watchlists" />
            </div>
            <HairlineRule ink="hairline" />
            <div className="flex items-center justify-between font-annual text-body-sm text-text-tertiary">
              <span>Last Updated</span>
              <span>
                {player.updated_at
                  ? new Date(player.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </span>
            </div>
          </div>
        </PaperCard>
      </div>
    </div>
  );
}

// Videos Tab Component
function VideosTab({ videos, displayName }: { videos: PlayerVideo[]; displayName: string }) {
  if (videos.length === 0) {
    return (
      <EditorsLetter
        ink="pursuit"
        title="No video on file yet"
        body={`${displayName} hasn't posted any game film, bullpen or batting-practice video to this profile. When they do, it plays right here — no download, no third-party link.`}
      />
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
function StatsTab({ player, displayName }: { player: PlayerData; displayName: string }) {
  // A profile with nothing recorded renders as a wall of em-dashes. The ghost
  // rows are the kit's deliberate "waiting to be filled" treatment (see the
  // Living Annual empty-state doctrine) and they stay — but on their own they
  // read as a broken page rather than a new one, so when EVERY measurable is
  // absent we say what is actually going on first, then let the rows show what
  // will fill in.
  const hasAnyMeasurable =
    (player.height_feet != null && player.height_inches != null) ||
    player.weight_lbs != null ||
    Boolean(player.bats) ||
    Boolean(player.throws) ||
    player.pitch_velo != null ||
    player.exit_velo != null ||
    player.sixty_time != null ||
    player.gpa != null ||
    player.sat_score != null ||
    player.act_score != null;

  return (
    <div className="space-y-6">
      {!hasAnyMeasurable && (
        <EditorsLetter
          ink="pursuit"
          title="No measurables recorded yet"
          body={`${displayName} hasn't logged a height, weight, velocity or test score. Each line below fills in as they're recorded — nothing here is being withheld.`}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Physical Stats */}
        <PaperCard className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <IconActivity size={20} className="text-pursuit" />
            <Eyebrow ink="pursuit">Physical Profile</Eyebrow>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:gap-x-8">
            <RuledStatLine
              label="Height"
              value={player.height_feet && player.height_inches != null ? formatHeight(player.height_feet, player.height_inches) : ''}
              ghost={!(player.height_feet && player.height_inches != null)}
              ink="pursuit"
              size="row"
            />
            <RuledStatLine label="Weight" value={player.weight_lbs ? String(player.weight_lbs) : ''} unit={player.weight_lbs ? 'LBS' : undefined} ghost={!player.weight_lbs} ink="pursuit" size="row" />
            <RuledStatLine label="Bats" value={player.bats ?? ''} ghost={!player.bats} ink="pursuit" size="row" />
            <RuledStatLine label="Throws" value={player.throws ?? ''} ghost={!player.throws} ink="pursuit" size="row" />
          </div>
        </PaperCard>

        {/* Performance Metrics */}
        <PaperCard className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <IconTarget size={20} className="text-pursuit" />
            <Eyebrow ink="pursuit">Performance Metrics</Eyebrow>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <RuledStatLine
              label="Pitch Velocity"
              value={player.pitch_velo != null ? String(player.pitch_velo) : ''}
              unit={player.pitch_velo != null ? 'MPH' : undefined}
              ghost={player.pitch_velo == null}
              ink="pursuit"
              size="row"
            />
            <RuledStatLine
              label="Exit Velocity"
              value={player.exit_velo != null ? String(player.exit_velo) : ''}
              unit={player.exit_velo != null ? 'MPH' : undefined}
              ghost={player.exit_velo == null}
              ink="pursuit"
              size="row"
            />
            <RuledStatLine
              label="60-Yard Dash"
              value={player.sixty_time != null ? String(player.sixty_time) : ''}
              unit={player.sixty_time != null ? 'SEC' : undefined}
              ghost={player.sixty_time == null}
              ink="pursuit"
              size="row"
            />
          </div>
        </PaperCard>

        {/* Academics */}
        <PaperCard className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <IconSchool size={20} className="text-pursuit" />
            <Eyebrow ink="pursuit">Academics</Eyebrow>
          </div>
          {/* Two columns on phones, three from sm. "SAT SCORE" / "ACT SCORE"
              are the longest labels on this page and wrapped to two lines in a
              ~74px track at 320px, leaving the three rows visibly unequal. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <RuledStatLine label="GPA" value={player.gpa != null ? player.gpa.toFixed(2) : ''} ghost={player.gpa == null} ink="pursuit" size="row" />
            <RuledStatLine label="SAT Score" value={player.sat_score != null ? player.sat_score.toString() : ''} ghost={player.sat_score == null} ink="pursuit" size="row" />
            <RuledStatLine label="ACT Score" value={player.act_score != null ? player.act_score.toString() : ''} ghost={player.act_score == null} ink="pursuit" size="row" />
          </div>
        </PaperCard>
        {/* There was a fourth "Player Info" card here (position / secondary /
            class / location). It was removed for two reasons, not one:
            1. Every one of those four values already renders in the passport
               masthead's <Eyebrow> dateline, which is pinned above the tab strip
               and therefore visible on this very tab.
            2. RuledStatLine sets its value at `text-ink`
               (clamp(2.5rem, 5vw, 4.5rem) — 40px on a phone), which is right for
               a measurable and wrong for free text. "Los Angeles, CA" at 40px is
               ~330px wide in a ~110px grid track, and because a flex/grid item
               will not shrink below the min-content width of unbreakable text it
               overflowed the card and gave the whole document a horizontal
               scrollbar on every phone. Deleting the duplicate fixes the bug
               rather than papering over it. */}
      </div>
    </div>
  );
}

// Teams Tab Component
function TeamsTab({ teamHistory, displayName }: { teamHistory: TeamMembership[]; displayName: string }) {
  if (teamHistory.length === 0) {
    return (
      <EditorsLetter
        ink="pursuit"
        title="No team history on file"
        body={`${displayName} hasn't been added to a roster in Helm yet, so there's no club, jersey number or set of dates to show. Team history appears here automatically once a coach adds them.`}
      />
    );
  }

  return (
    <PaperCard className="overflow-hidden p-0">
      <div className="p-6 border-b border-[color:var(--hairline)]">
        <div className="flex items-center gap-2">
          <IconUsers size={20} className="text-pursuit" />
          <Eyebrow ink="pursuit">Team History</Eyebrow>
        </div>
      </div>
      <div>
        {teamHistory.map((membership, i) => {
          const org = membership.team?.organization;
          if (!org) return null;

          const joinDate = membership.joined_at
            ? new Date(membership.joined_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : null;
          const leftDate = membership.left_at
            ? new Date(membership.left_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : 'Present';

          return (
            <Reveal key={membership.id} staggerIndex={Math.min(i, 10)}>
              <Link
                href={`/baseball/program/${org.id}`}
                className={cn('block', i > 0 && 'border-t border-[color:var(--hairline)]', pressableClass({ ink: 'pursuit' }))}
              >
                <HoverReveal
                  className="p-6"
                  revealClassName="flex w-5 shrink-0 items-center justify-center"
                  reveal={<IconChevronRight size={16} className="text-pursuit" aria-hidden />}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      'w-14 h-14 rounded-card border border-[color:var(--hairline)] flex items-center justify-center',
                      membership.status === 'active' ? 'bg-[var(--paper)]' : 'bg-[var(--paper-canvas)]'
                    )}>
                      {org.logo_url ? (
                        <Image src={org.logo_url} alt={org.name} width={40} height={40} className="w-10 h-10 rounded-lg object-cover" unoptimized />
                      ) : (
                        <IconUsers size={24} className={membership.status === 'active' ? 'text-pursuit' : 'text-text-tertiary'} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-annual text-body font-semibold text-text-primary">
                          {membership.team?.name || org.name}
                        </p>
                        {membership.status === 'active' && (
                          <InkBadge label="Current" tone="pursuit" variant="solid" />
                        )}
                      </div>
                      <p className="font-annual text-body-sm text-text-tertiary">
                        {org.name}
                        {org.location_city && org.location_state && ` · ${org.location_city}, ${org.location_state}`}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        {membership.position && (
                          <PositionChip label={membership.position} ink="neutral" size="sm" />
                        )}
                        {membership.jersey_number && (
                          <span className="text-eyebrow text-text-tertiary">#{membership.jersey_number}</span>
                        )}
                        {joinDate && (
                          <span className="flex items-center gap-1 text-eyebrow text-text-tertiary">
                            <IconCalendar size={12} />
                            {joinDate} - {leftDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </HoverReveal>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </PaperCard>
  );
}

// Achievements Tab Component
function AchievementsTab({ achievements, displayName }: { achievements: PlayerAchievement[]; displayName: string }) {
  if (achievements.length === 0) {
    return (
      <EditorsLetter
        ink="pursuit"
        title="No awards listed yet"
        body={`${displayName} hasn't added any all-conference, all-state or tournament honors to this profile. An empty list here doesn't mean there aren't any — it means none have been entered.`}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {achievements.map((achievement, i) => (
        <Reveal key={achievement.id} staggerIndex={Math.min(i, 10)}>
          <PaperCard className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-card border border-[color:var(--hairline)] bg-[var(--paper-canvas)] flex items-center justify-center flex-shrink-0">
                <IconTrophy size={22} className="text-pursuit" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-annual text-body font-semibold text-text-primary">{achievement.achievement_text}</p>
                <div className="flex items-center gap-2 mt-2">
                  {achievement.achievement_type && (
                    <InkBadge label={achievement.achievement_type} tone="pursuit" variant="soft" />
                  )}
                  {achievement.achievement_date && (
                    <span className="text-eyebrow text-text-tertiary">
                      {new Date(achievement.achievement_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </PaperCard>
        </Reveal>
      ))}
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
        className={cn(
          'group relative w-full overflow-hidden rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] text-left transition-colors hover:border-pursuit/40',
        )}
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
              <div className="w-14 h-14 rounded-full bg-[var(--paper)] flex items-center justify-center shadow-xl">
                <IconPlay size={20} className="text-pursuit ml-0.5" />
              </div>
            </div>
            {video.is_primary && (
              <div className="absolute top-2 right-2">
                <InkBadge label="Featured" tone="pursuit" variant="solid" />
              </div>
            )}
          </div>
        ) : (
          <div className={cn("bg-[var(--paper-canvas)] flex items-center justify-center", large ? "aspect-video" : "aspect-[16/10]")}>
            <IconVideo size={40} className="text-text-tertiary" />
          </div>
        )}
        <div className="p-4">
          <p className="font-annual text-body-sm font-medium text-text-primary truncate">{video.title}</p>
          <div className="flex items-center justify-between mt-1">
            {video.video_type && (
              <span className="text-eyebrow text-text-tertiary">{video.video_type}</span>
            )}
            {video.duration && (
              <span className="text-eyebrow text-text-tertiary">
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
          <p className="text-sm text-text-tertiary text-center py-8">Video unavailable</p>
        )}
      </Modal>
    </>
  );
}
