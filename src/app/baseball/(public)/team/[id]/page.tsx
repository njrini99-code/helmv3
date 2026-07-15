import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import Link from 'next/link';
import {
  IconUsers,
  IconBuilding,
} from '@/components/icons';
import { Metadata } from 'next';
import Image from 'next/image';
import { HelmMark } from '@/components/brand/HelmMark';
import { resolveRecruitingViewerAccess } from '@/lib/baseball/recruiting-viewer-access';
import { cn } from '@/lib/utils';
import {
  PaperCard,
  Masthead,
  Eyebrow,
  HairlineRule,
  InkBadge,
  EditorsLetter,
  EmptyIssue,
  pressableClass,
} from '@/components/baseball/living-annual';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Helper to format player name with privacy
function formatPlayerName(
  firstName: string | null,
  lastName: string | null,
  recruitingActivated: boolean
): string {
  if (recruitingActivated) {
    return `${firstName || ''} ${lastName || ''}`.trim();
  }
  // Privacy mode: Show initials + asterisks
  const firstInitial = firstName ? firstName.charAt(0).toUpperCase() : '';
  const lastInitial = lastName ? lastName.charAt(0).toUpperCase() : '';
  return `${firstInitial}.${lastInitial}****`;
}

// Get team type display name
function getTeamTypeLabel(teamType: string): string {
  switch (teamType) {
    case 'college':
      return 'College';
    case 'juco':
      return 'JUCO';
    case 'high_school':
      return 'High School';
    case 'showcase':
      return 'Showcase';
    default:
      return teamType;
  }
}

// Splits a program/team name into the two-line <Masthead> grammar (a lighter
// "given" line over a bold small-caps "surname" line) — the trailing word
// (e.g. "Rini University Baseball" -> given "Rini University", surname
// "BASEBALL") reads as the program masthead's dominant banner line. Single-
// word names fall back to an empty given line.
function splitProgramName(name: string): { given: string; surname: string } {
  const trimmed = name.trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) {
    return { given: '', surname: trimmed };
  }
  return {
    given: trimmed.slice(0, lastSpace),
    surname: trimmed.slice(lastSpace + 1),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  // Read through the anon-safe public view — metadata generation runs for
  // logged-out visitors too, and the base baseball_teams table is
  // authenticated-only via RLS.
  const { data: team } = await fromUntyped(supabase, 'baseball_teams_public_profile')
    .select('name, team_type')
    .eq('id', id)
    .maybeSingle();

  if (!team) {
    return {
      title: 'Team Not Found | Helm',
    };
  }

  return {
    title: `${team.name} | Helm`,
    description: `View ${team.name}'s roster, coaching staff, and program information.`,
  };
}

export default async function TeamProfilePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // ============================================================
  // GATING: public route group, but access is tiered:
  // - Logged-out visitors: SAFE public view (team/org identity, coaching
  //   staff name+role+avatar, team-level facts). Roster stays gated.
  // - Authenticated college/juco (recruiting) coaches: full current
  //   behavior, unchanged.
  // - Any other authenticated user (player, HS/showcase coach, etc.):
  //   unchanged pre-existing block — this task only widens access for
  //   LOGGED-OUT visitors, per product decision.
  // ============================================================
  const { isPublicViewer, coach } = await resolveRecruitingViewerAccess(supabase);

  interface TeamCore {
    id: string;
    name: string;
    team_type: string;
    description: string | null;
  }

  interface TeamOrganization {
    id?: string;
    name?: string;
    logo_url: string | null;
    description: string | null;
    division: string | null;
    conference: string | null;
    website_url: string | null;
    location_city: string | null;
    location_state: string | null;
  }

  let team: TeamCore;
  let org: TeamOrganization | null = null;

  if (isPublicViewer) {
    // ------------------------------------------------------------
    // ANON PATH: read exclusively through the anon-safe public views
    // (supabase/migrations/20260702110000_baseball_public_team_program_profile_views.sql,
    // db_gated). The base tables are authenticated-only via RLS.
    // ------------------------------------------------------------
    const { data: publicTeam } = await fromUntyped(supabase, 'baseball_teams_public_profile')
      .select('id, name, team_type, description, organization_id')
      .eq('id', id)
      .maybeSingle();

    if (!publicTeam) {
      notFound();
    }

    team = {
      id: publicTeam.id,
      name: publicTeam.name,
      team_type: publicTeam.team_type,
      description: publicTeam.description,
    };

    if (publicTeam.organization_id) {
      const { data: publicOrg } = await fromUntyped(supabase, 'organizations_public_profile')
        .select('logo_url, description, division, conference, website_url, location_city, location_state')
        .eq('id', publicTeam.organization_id)
        .maybeSingle();
      org = publicOrg ?? null;
    }
  } else {
    // ------------------------------------------------------------
    // AUTHENTICATED RECRUITING COACH PATH: unchanged from prior behavior.
    // ------------------------------------------------------------
    interface FullTeamData extends TeamCore {
      logo_url: string | null;
      join_code: string | null;
      organization: TeamOrganization | null;
    }

    const { data: teamData, error: teamError } = await supabase
      .from('baseball_teams')
      .select(`
        id,
        name,
        team_type,
        description,
        logo_url,
        join_code,
        organization:organizations (
          id,
          name,
          logo_url,
          description,
          division,
          conference,
          website_url,
          location_city,
          location_state
        )
      `)
      .eq('id', id)
      .single();

    // Type assertion to handle TypeScript until types are regenerated
    const fullTeam = teamData as unknown as FullTeamData | null;

    if (teamError || !fullTeam) {
      notFound();
    }

    team = {
      id: fullTeam.id,
      name: fullTeam.name,
      team_type: fullTeam.team_type,
      description: fullTeam.description,
    };
    org = fullTeam.organization;
  }

  type OrgFacility = {
    id: string;
    name: string;
    facility_type: string | null;
    description: string | null;
    image_url: string | null;
    display_order: number;
  };

  type StaffMember = {
    id: string;
    name: string;
    title: string;
    bio: string | null;
    headshot_url: string | null;
    display_order: number;
  };

  // ============================================================
  // ROSTER VISIBILITY: Coaches can only view rosters of teams they recruit
  // from. Logged-out visitors never see the roster.
  // - College coaches: can view HS and Showcase rosters
  // - JUCO coaches: can only view HS rosters
  // ============================================================
  const canViewRoster = (() => {
    if (isPublicViewer || !coach) return false;
    if (coach.coach_type === 'college') {
      return ['high_school', 'showcase'].includes(team.team_type);
    }
    if (coach.coach_type === 'juco') {
      return team.team_type === 'high_school';
    }
    return false;
  })();

  type RosterMember = {
    id: string;
    position: string | null;
    jersey_number: string | null;
    status: string | null;
    joined_at: string | null;
    player: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      primary_position: string | null;
      secondary_position: string | null;
      grad_year: number | null;
      avatar_url: string | null;
      recruiting_activated: boolean | null;
      city: string | null;
      state: string | null;
    } | null;
  };

  let sortedRoster: RosterMember[] = [];

  if (canViewRoster) {
    // Fetch roster (team members with player data) - only if coach can view it
    const { data: rosterData } = await supabase
      .from('baseball_team_members')
      .select(`
        id,
        position,
        jersey_number,
        status,
        joined_at,
        player:baseball_players (
          id,
          first_name,
          last_name,
          primary_position,
          secondary_position,
          grad_year,
          avatar_url,
          recruiting_activated,
          city,
          state
        )
      `)
      .eq('team_id', id)
      .or('status.eq.active,status.is.null');

    const roster = (rosterData as RosterMember[] | null) || [];

    // Sort roster by last name, then first name
    sortedRoster = roster
      .filter((m) => m.player)
      .sort((a, b) => {
        const lastA = a.player?.last_name || '';
        const lastB = b.player?.last_name || '';
        if (lastA !== lastB) return lastA.localeCompare(lastB);
        const firstA = a.player?.first_name || '';
        const firstB = b.player?.first_name || '';
        return firstA.localeCompare(firstB);
      });
  }

  // Fetch coaching staff. Authenticated recruiting coaches get the full
  // identity (name, title, bio, headshot) via the base tables; logged-out
  // visitors get the SAFE subset (name, role, avatar — no bio) via the
  // anon-readable public view.
  const staff: StaffMember[] = [];

  if (isPublicViewer) {
    const { data: publicStaffRows } = await fromUntyped(supabase, 'baseball_team_coach_staff_public')
      .select('coach_id, is_primary, role, full_name, avatar_url')
      .eq('team_id', id);

    if (publicStaffRows) {
      const seen = new Set<string>();
      const sortedStaffRows = [...publicStaffRows].sort(
        (a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)
      );
      sortedStaffRows.forEach((row, index) => {
        const coachId = row.coach_id as string | null;
        if (!coachId || seen.has(coachId)) return;
        seen.add(coachId);
        staff.push({
          id: coachId,
          name: (row.full_name as string | null)?.trim() || 'Coach',
          title: row.is_primary ? 'Head Coach' : ((row.role as string | null) ?? 'Assistant Coach'),
          bio: null,
          headshot_url: row.avatar_url as string | null,
          display_order: index,
        });
      });
    }
  } else {
    // Fetch coaching staff via baseball_team_coach_staff -> baseball_coaches (scoped to this team)
    // NOTE: baseball_coaches has `full_name`, not first_name/last_name — do not select
    // first_name/last_name here, PostgREST will 400 (see database.ts baseball_coaches.Row).
    const { data: staffRows } = await supabase
      .from('baseball_team_coach_staff')
      .select(`
        is_primary,
        role,
        baseball_coaches!inner(
          id,
          full_name,
          bio,
          avatar_url
        )
      `)
      .eq('team_id', id);

    if (staffRows) {
      const seen = new Set<string>();
      // Sort: primary coaches first
      const sortedStaffRows = [...staffRows].sort(
        (a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)
      );
      sortedStaffRows.forEach((row, index) => {
        const c = row.baseball_coaches as unknown as {
          id: string;
          full_name: string | null;
          bio: string | null;
          avatar_url: string | null;
        } | null;
        if (!c || seen.has(c.id)) return;
        seen.add(c.id);
        staff.push({
          id: c.id,
          name: c.full_name?.trim() || 'Coach',
          title: row.is_primary ? 'Head Coach' : (row.role ?? 'Assistant Coach'),
          bio: c.bio,
          headshot_url: c.avatar_url,
          display_order: index,
        });
      });
    }
  }

  // Get facilities from organization (only for college/juco)
  // organization_facilities has no backing table yet — always empty until it exists.
  const showFacilities = team.team_type === 'college' || team.team_type === 'juco';
  const facilities: OrgFacility[] = [];

  // Location - use org location (teams don't have city/state directly)
  const location = {
    city: org?.location_city,
    state: org?.location_state,
  };

  // Program masthead name — the trailing word (usually "Baseball") reads as
  // the bold small-caps banner line under the lighter program name. A
  // single-word team name has no natural split, so the lighter line falls
  // back to the team type rather than rendering blank.
  const programName = splitProgramName(team.name);
  const mastheadGiven = programName.given || getTeamTypeLabel(team.team_type);

  // Quick Facts sidebar — same fields/conditions as before, built as a plain
  // array so the label/value rows below can map over it (avoids repeating
  // the same conditional five times).
  const quickFacts: { label: string; value: string | number }[] = [
    { label: 'Type', value: getTeamTypeLabel(team.team_type) },
  ];
  if (org?.division) quickFacts.push({ label: 'Division', value: org.division });
  if (org?.conference) quickFacts.push({ label: 'Conference', value: org.conference });
  if (canViewRoster) quickFacts.push({ label: 'Roster Size', value: sortedRoster.length });
  if (staff.length > 0) quickFacts.push({ label: 'Coaching Staff', value: staff.length });

  return (
    <div className="min-h-dvh bg-[var(--paper-canvas)]">
      {/* Header */}
      <div className="border-b border-[color:var(--hairline)] bg-[var(--paper)]">
        <div className="max-w-[1536px] mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <HelmMark sport="baseball" size={32} className="h-8 w-8" unoptimized />
              <span className="font-annual font-semibold text-text-primary">Helm</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1536px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Team Header */}
            <PaperCard registrationTick className="p-8">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-6">
                {org?.logo_url ? (
                  <Image
                    src={org.logo_url}
                    alt={team.name}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-fw-md border border-[color:var(--hairline)] object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-fw-md border border-[color:var(--hairline)] bg-grade-plus/10">
                    <IconBuilding size={40} className="text-grade-plus" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <Masthead
                    given={mastheadGiven}
                    surname={programName.surname}
                    dateline={
                      <Eyebrow
                        ink="team"
                        items={[
                          getTeamTypeLabel(team.team_type),
                          org?.division,
                          org?.conference,
                          location.city && location.state ? `${location.city}, ${location.state}` : null,
                        ]}
                      />
                    }
                    ink="team"
                    accentRule
                  />
                </div>
              </div>

              {(team.description || org?.description) && (
                <div className="mt-8">
                  <HairlineRule className="mb-6" />
                  <Eyebrow as="h2" ink="muted" className="mb-2">About</Eyebrow>
                  <p className="font-annual text-body-lg leading-relaxed text-text-secondary whitespace-pre-line">
                    {team.description || org?.description}
                  </p>
                </div>
              )}
            </PaperCard>

            {/* Roster - gated: sign-in prompt for anon, permission-gated for coaches */}
            {isPublicViewer ? (
              <EditorsLetter
                title="Sign in to view roster"
                body="Roster details are visible to verified college and JUCO coaches."
                ink="team"
                action={
                  <Link
                    href={`/baseball/login?returnTo=${encodeURIComponent(`/baseball/team/${id}`)}`}
                    className="inline-flex items-center justify-center gap-2 rounded-fw-full bg-primary-600 px-5 py-2.5 min-h-[44px] text-sm font-medium text-white shadow-sm transition-all duration-200 ease-out hover:bg-primary-700 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]"
                  >
                    Sign in
                  </Link>
                }
              />
            ) : canViewRoster ? (
              sortedRoster.length > 0 ? (
                <PaperCard className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-6">
                    <div className="flex items-center gap-2">
                      <IconUsers size={20} className="text-grade-plus" />
                      <h2 className="font-annual text-h2 text-text-primary">Roster</h2>
                    </div>
                    <span className="text-body-sm text-text-tertiary">{sortedRoster.length} players</span>
                  </div>
                  <div className="divide-y divide-[color:var(--hairline)]">
                    {sortedRoster.map((member) => {
                      const player = member.player!;
                      const isRecruiting = player.recruiting_activated === true;
                      const displayName = formatPlayerName(
                        player.first_name,
                        player.last_name,
                        isRecruiting
                      );

                      return (
                        <div
                          key={member.id}
                          className={cn('p-4', isRecruiting && pressableClass({ ink: 'team' }))}
                        >
                          {isRecruiting ? (
                            <Link
                              href={`/baseball/player/${player.id}`}
                              className="flex items-center gap-4"
                            >
                              <RosterPlayerRow
                                player={player}
                                member={member}
                                displayName={displayName}
                                isRecruiting={isRecruiting}
                              />
                            </Link>
                          ) : (
                            <div className="flex items-center gap-4">
                              <RosterPlayerRow
                                player={player}
                                member={member}
                                displayName={displayName}
                                isRecruiting={isRecruiting}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </PaperCard>
              ) : (
                <EmptyIssue variant="roster" ink="team" />
              )
            ) : (
              <EditorsLetter
                title="Roster not available"
                body={
                  coach?.coach_type === 'juco'
                    ? 'JUCO coaches can only view high school team rosters.'
                    : "You do not have access to view this team's roster."
                }
                ink="team"
              />
            )}

            {/* Coaching Staff */}
            {staff.length > 0 && (
              <PaperCard className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-6">
                  <IconUsers size={20} className="text-grade-plus" />
                  <h2 className="font-annual text-h2 text-text-primary">Coaching Staff</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {staff.map((member) => (
                      <div
                        key={member.id}
                        className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-4"
                      >
                        <div className="flex items-start gap-4">
                          {member.headshot_url ? (
                            <Image
                              src={member.headshot_url}
                              alt={member.name}
                              width={64}
                              height={64}
                              className="w-16 h-16 rounded-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <Avatar
                              name={member.name}
                              size="lg"
                              className="flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-annual font-semibold text-text-primary truncate">
                              {member.name}
                            </h3>
                            <p className="text-body-sm leading-relaxed text-grade-plus mb-2">{member.title}</p>
                            {member.bio && (
                              <p className="text-xs text-text-tertiary line-clamp-3">
                                {member.bio}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </PaperCard>
            )}

            {/* Facilities (College/JUCO only) */}
            {showFacilities && facilities.length > 0 && (
              <PaperCard className="overflow-hidden">
                <div className="border-b border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-6">
                  <h2 className="font-annual text-h2 text-text-primary">Facilities</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {facilities.map((facility) => (
                      <div
                        key={facility.id}
                        className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] overflow-hidden"
                      >
                        {facility.image_url ? (
                          <Image
                            src={facility.image_url}
                            alt={facility.name}
                            width={400}
                            height={160}
                            className="w-full h-40 object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-40 flex items-center justify-center bg-[var(--paper)]">
                            <IconBuilding size={32} className="text-text-tertiary" />
                          </div>
                        )}
                        <div className="p-4">
                          <h3 className="font-annual font-semibold text-text-primary mb-1">
                            {facility.name}
                          </h3>
                          {facility.description && (
                            <p className="text-body-sm leading-relaxed text-text-secondary line-clamp-2">
                              {facility.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </PaperCard>
            )}

            {/* Team Facilities Image - from organization if available */}
            {showFacilities && facilities.length > 0 && facilities[0]?.image_url && (
              <PaperCard className="overflow-hidden">
                <div className="border-b border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-6">
                  <h2 className="font-annual text-h2 text-text-primary">Team Facility</h2>
                </div>
                <Image
                  src={facilities[0]?.image_url ?? ''}
                  alt={`${team.name} Facilities`}
                  width={800}
                  height={256}
                  className="w-full h-64 object-cover"
                  unoptimized
                />
              </PaperCard>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Quick Facts */}
            <PaperCard className="p-6">
              <Eyebrow as="h3" ink="muted" className="mb-4">Quick Facts</Eyebrow>
              <div className="space-y-3">
                {quickFacts.map((fact) => (
                  <div key={fact.label} className="flex items-center justify-between gap-4">
                    <span className="text-body-sm text-text-secondary">{fact.label}</span>
                    <span className="text-body-sm font-semibold text-text-primary">{fact.value}</span>
                  </div>
                ))}
              </div>
            </PaperCard>

            {/* Contact */}
            {org?.website_url && (
              <PaperCard className="p-6">
                <Eyebrow as="h3" ink="muted" className="mb-4">Contact</Eyebrow>
                <a
                  href={org.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-body-sm text-grade-plus hover:text-grade-plus/80 hover:underline break-all"
                >
                  Visit Website
                </a>
              </PaperCard>
            )}

            {/* Legend - Only show when roster is visible */}
            {canViewRoster && (
              <PaperCard className="p-6">
                <Eyebrow as="h3" ink="muted" className="mb-4">Roster Legend</Eyebrow>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <InkBadge label="Verified" tone="team" />
                    <span className="text-xs text-text-tertiary">Recruiting active</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-text-tertiary">J.S****</span>
                    <span className="text-xs text-text-tertiary">Privacy protected</span>
                  </div>
                </div>
              </PaperCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Roster player row component
function RosterPlayerRow({
  player,
  member,
  displayName,
  isRecruiting,
}: {
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    avatar_url: string | null;
    city: string | null;
    state: string | null;
  };
  member: {
    position: string | null;
    jersey_number: string | null;
  };
  displayName: string;
  isRecruiting: boolean;
}) {
  return (
    <>
      {/* Avatar */}
      {isRecruiting && player.avatar_url ? (
        <Image
          src={player.avatar_url}
          alt={displayName}
          width={48}
          height={48}
          className="w-12 h-12 rounded-full object-cover"
          unoptimized
        />
      ) : (
        <div className="w-12 h-12 rounded-full border border-[color:var(--hairline)] bg-[var(--paper-canvas)] flex items-center justify-center">
          <span className="text-lg font-semibold text-text-tertiary">
            {player.first_name?.charAt(0) || '?'}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('font-annual font-semibold truncate', isRecruiting ? 'text-text-primary' : 'text-text-tertiary')}>
            {displayName}
          </span>
          {isRecruiting && <InkBadge label="Verified" tone="team" />}
        </div>
        <Eyebrow
          ink="muted"
          items={[
            member.position || player.primary_position,
            player.grad_year ? `Class of ${player.grad_year}` : null,
            isRecruiting && player.city && player.state ? `${player.city}, ${player.state}` : null,
          ]}
        />
      </div>

      {/* Jersey Number */}
      {member.jersey_number && (
        <div className="font-annual text-lg font-bold tabular-nums text-text-tertiary">
          #{member.jersey_number}
        </div>
      )}
    </>
  );
}
