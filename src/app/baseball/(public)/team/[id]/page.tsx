import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import Link from 'next/link';
import {
  IconMapPin,
  IconUsers,
  IconBuilding,
  IconShield,
} from '@/components/icons';
import { Metadata } from 'next';
import Image from 'next/image';

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: team } = await supabase
    .from('baseball_teams')
    .select('name, team_type')
    .eq('id', id)
    .single();

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
  // AUTH CHECK: Only college/juco coaches can view team profiles
  // ============================================================
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    notFound(); // Block unauthenticated access
  }

  // Check if user is a recruiting coach (college or juco)
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('coach_type')
    .eq('user_id', user.id)
    .single();

  if (!coach || !['college', 'juco'].includes(coach.coach_type)) {
    notFound(); // Block non-recruiting coaches
  }

  // Define team type for type assertions (until Supabase types are regenerated)
  interface TeamData {
    id: string;
    name: string;
    team_type: string;
    description: string | null;
    logo_url: string | null;
    join_code: string | null;
    organization: {
      id: string;
      name: string;
      logo_url: string | null;
      description: string | null;
      division: string | null;
      conference: string | null;
      website_url: string | null;
      location_city: string | null;
      location_state: string | null;
    } | null;
  }

  // Fetch team with organization data
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
  const team = teamData as unknown as TeamData | null;

  if (teamError || !team) {
    notFound();
  }

  // Type assertions for organization data
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

  interface TeamOrganization {
    id: string;
    name: string;
    logo_url: string | null;
    description: string | null;
    division: string | null;
    conference: string | null;
    website_url: string | null;
    location_city: string | null;
    location_state: string | null;
  }

  const org = team.organization as TeamOrganization | null;

  // ============================================================
  // ROSTER VISIBILITY: Coaches can only view rosters of teams they recruit from
  // - College coaches: can view HS and Showcase rosters
  // - JUCO coaches: can only view HS rosters
  // ============================================================
  const canViewRoster = (() => {
    if (coach.coach_type === 'college') {
      return ['high_school', 'showcase'].includes(team.team_type);
    }
    if (coach.coach_type === 'juco') {
      return team.team_type === 'high_school';
    }
    return false;
  })();

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

  const roster = (rosterData as RosterMember[] | null) || [];

  // Sort roster by last name, then first name
  const sortedRoster = roster
    .filter((m) => m.player)
    .sort((a, b) => {
      const lastA = a.player?.last_name || '';
      const lastB = b.player?.last_name || '';
      if (lastA !== lastB) return lastA.localeCompare(lastB);
      const firstA = a.player?.first_name || '';
      const firstB = b.player?.first_name || '';
      return firstA.localeCompare(firstB);
    });

  // Fetch coaching staff via baseball_team_coach_staff -> baseball_coaches (scoped to this team)
  const { data: staffRows } = await supabase
    .from('baseball_team_coach_staff')
    .select(`
      is_primary,
      role,
      baseball_coaches!inner(
        id,
        first_name,
        last_name,
        bio,
        avatar_url
      )
    `)
    .eq('team_id', id);

  const staff: StaffMember[] = [];
  if (staffRows) {
    const seen = new Set<string>();
    // Sort: primary coaches first
    const sortedStaffRows = [...staffRows].sort(
      (a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)
    );
    sortedStaffRows.forEach((row, index) => {
      const c = row.baseball_coaches as unknown as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        bio: string | null;
        avatar_url: string | null;
      } | null;
      if (!c || seen.has(c.id)) return;
      seen.add(c.id);
      staff.push({
        id: c.id,
        name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Coach',
        title: row.is_primary ? 'Head Coach' : (row.role ?? 'Assistant Coach'),
        bio: c.bio,
        headshot_url: c.avatar_url,
        display_order: index,
      });
    });
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

  return (
    <div className="min-h-dvh bg-[#FAF6F1]">
      {/* Header */}
      <div className="bg-white border-b border-warm-200">
        <div className="max-w-[1536px] mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <span className="font-semibold text-warm-900">Helm</span>
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
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-br from-primary-50 to-white p-8 border-b border-warm-200">
                <div className="flex items-start gap-6">
                  {org?.logo_url ? (
                    <Image
                      src={org.logo_url}
                      alt={team.name}
                      width={96}
                      height={96}
                      className="w-24 h-24 rounded-lg object-cover border-2 border-white shadow-lg"
                      unoptimized
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-primary-600 flex items-center justify-center shadow-lg">
                      <IconBuilding size={48} className="text-white" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h1 className="text-3xl font-bold text-warm-900 mb-2">
                      {team.name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Badge variant="success">{getTeamTypeLabel(team.team_type)}</Badge>
                      {org?.division && (
                        <Badge variant="secondary">{org.division}</Badge>
                      )}
                      {org?.conference && (
                        <Badge>{org.conference}</Badge>
                      )}
                    </div>
                    {location.city && location.state && (
                      <div className="flex items-center gap-2 text-warm-600">
                        <IconMapPin size={16} />
                        <span className="text-sm">
                          {location.city}, {location.state}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {(team.description || org?.description) && (
                <div className="p-6 bg-white">
                  <h2 className="text-lg font-semibold tracking-tight text-warm-900 mb-3">About</h2>
                  <p className="text-warm-600 leading-relaxed whitespace-pre-line">
                    {team.description || org?.description}
                  </p>
                </div>
              )}
            </Card>

            {/* Roster - Only shown if coach has permission to view */}
            {canViewRoster ? (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-warm-200 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconUsers size={20} className="text-primary-600" />
                      <h2 className="text-lg font-semibold tracking-tight text-warm-900">Roster</h2>
                    </div>
                    <span className="text-sm text-warm-500">{sortedRoster.length} players</span>
                  </div>
                </div>
                <div className="divide-y divide-warm-100">
                  {sortedRoster.length > 0 ? (
                    sortedRoster.map((member) => {
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
                          className={`p-4 hover:bg-warm-50 active:bg-warm-100 transition-colors ${
                            isRecruiting ? 'cursor-pointer' : ''
                          }`}
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
                    })
                  ) : (
                    <div className="p-8 text-center text-warm-500">
                      No players on the roster yet.
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-warm-200 bg-white">
                  <div className="flex items-center gap-2">
                    <IconUsers size={20} className="text-primary-600" />
                    <h2 className="text-lg font-semibold tracking-tight text-warm-900">Roster</h2>
                  </div>
                </div>
                <div className="p-8 text-center">
                  <div className="text-warm-400 mb-2">
                    <IconShield size={32} className="mx-auto" />
                  </div>
                  <p className="text-warm-600 font-medium">Roster not available</p>
                  <p className="text-sm text-warm-500 mt-1">
                    {coach.coach_type === 'juco'
                      ? 'JUCO coaches can only view high school team rosters.'
                      : 'You do not have access to view this team\'s roster.'}
                  </p>
                </div>
              </Card>
            )}

            {/* Coaching Staff */}
            {staff.length > 0 && (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-warm-200 bg-white">
                  <div className="flex items-center gap-2">
                    <IconUsers size={20} className="text-primary-600" />
                    <h2 className="text-lg font-semibold tracking-tight text-warm-900">Coaching Staff</h2>
                  </div>
                </div>
                <div className="p-6 bg-warm-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {staff.map((member) => (
                      <div
                        key={member.id}
                        className="bg-white rounded-lg border border-warm-200 p-4"
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
                            <h3 className="font-semibold text-warm-900 truncate">
                              {member.name}
                            </h3>
                            <p className="text-sm leading-relaxed text-primary-600 mb-2">{member.title}</p>
                            {member.bio && (
                              <p className="text-xs text-warm-600 line-clamp-3">
                                {member.bio}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Facilities (College/JUCO only) */}
            {showFacilities && facilities.length > 0 && (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-warm-200 bg-white">
                  <h2 className="text-lg font-semibold tracking-tight text-warm-900">Facilities</h2>
                </div>
                <div className="p-6 bg-warm-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {facilities.map((facility) => (
                      <div
                        key={facility.id}
                        className="bg-white rounded-lg border border-warm-200 overflow-hidden"
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
                          <div className="w-full h-40 bg-warm-100 flex items-center justify-center">
                            <IconBuilding size={32} className="text-warm-400" />
                          </div>
                        )}
                        <div className="p-4">
                          <h3 className="font-semibold text-warm-900 mb-1">
                            {facility.name}
                          </h3>
                          {facility.description && (
                            <p className="text-sm leading-relaxed text-warm-600 line-clamp-2">
                              {facility.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Team Facilities Image - from organization if available */}
            {showFacilities && facilities.length > 0 && facilities[0]?.image_url && (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-warm-200 bg-white">
                  <h2 className="text-lg font-semibold tracking-tight text-warm-900">Team Facility</h2>
                </div>
                <Image
                  src={facilities[0]?.image_url ?? ''}
                  alt={`${team.name} Facilities`}
                  width={800}
                  height={256}
                  className="w-full h-64 object-cover"
                  unoptimized
                />
              </Card>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Quick Facts */}
            <Card className="p-6 bg-gradient-to-br from-primary-50 to-white">
              <h3 className="text-sm font-semibold text-warm-900 uppercase tracking-wide mb-4">
                Quick Facts
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm leading-relaxed text-warm-600">Type</span>
                  <span className="text-sm font-semibold text-warm-900">
                    {getTeamTypeLabel(team.team_type)}
                  </span>
                </div>
                {org?.division && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm leading-relaxed text-warm-600">Division</span>
                    <span className="text-sm font-semibold text-warm-900">
                      {org.division}
                    </span>
                  </div>
                )}
                {org?.conference && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm leading-relaxed text-warm-600">Conference</span>
                    <span className="text-sm font-semibold text-warm-900">
                      {org.conference}
                    </span>
                  </div>
                )}
                {canViewRoster && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm leading-relaxed text-warm-600">Roster Size</span>
                    <span className="text-sm font-semibold text-warm-900">
                      {sortedRoster.length}
                    </span>
                  </div>
                )}
                {staff.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm leading-relaxed text-warm-600">Coaching Staff</span>
                    <span className="text-sm font-semibold text-warm-900">
                      {staff.length}
                    </span>
                  </div>
                )}
              </div>
            </Card>

            {/* Contact */}
            {org?.website_url && (
              <Card className="p-6">
                <h3 className="text-sm font-semibold text-warm-900 uppercase tracking-wide mb-4">
                  Contact
                </h3>
                <a
                  href={org.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm leading-relaxed text-primary-600 hover:text-primary-700 hover:underline break-all"
                >
                  Visit Website
                </a>
              </Card>
            )}

            {/* Legend - Only show when roster is visible */}
            {canViewRoster && (
              <Card className="p-6">
                <h3 className="text-sm font-semibold text-warm-900 uppercase tracking-wide mb-4">
                  Roster Legend
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="success" className="flex items-center gap-1">
                      <IconShield size={12} />
                      Verified
                    </Badge>
                    <span className="text-xs text-warm-600">Recruiting active</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-warm-400">J.S****</span>
                    <span className="text-xs text-warm-600">Privacy protected</span>
                  </div>
                </div>
              </Card>
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
        <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center">
          <span className="text-lg font-semibold text-warm-400">
            {player.first_name?.charAt(0) || '?'}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-semibold truncate ${isRecruiting ? 'text-warm-900' : 'text-warm-400'}`}>
            {displayName}
          </span>
          {isRecruiting && (
            <Badge variant="success" className="flex items-center gap-1 text-xs">
              <IconShield size={10} />
              Verified
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-warm-500">
          {member.position || player.primary_position ? (
            <span>{member.position || player.primary_position}</span>
          ) : null}
          {player.grad_year && (
            <>
              <span className="text-warm-300">•</span>
              <span>Class of {player.grad_year}</span>
            </>
          )}
          {isRecruiting && player.city && player.state && (
            <>
              <span className="text-warm-300">•</span>
              <span>{player.city}, {player.state}</span>
            </>
          )}
        </div>
      </div>

      {/* Jersey Number */}
      {member.jersey_number && (
        <div className="text-lg font-bold text-warm-300">
          #{member.jersey_number}
        </div>
      )}
    </>
  );
}
