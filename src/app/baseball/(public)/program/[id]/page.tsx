import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import Link from 'next/link';
import {
  IconMapPin,
  IconMail,
  IconUsers,
  IconBuilding,
  IconLock,
} from '@/components/icons';
import { Metadata } from 'next';
import Image from 'next/image';
import { ProgramTabs } from '@/components/baseball/program/ProgramTabs';
import { ProgramRoster } from '@/components/baseball/program/ProgramRoster';
import { resolveRecruitingViewerAccess } from '@/lib/baseball/recruiting-viewer-access';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  // Read through the anon-safe public view — metadata generation runs for
  // logged-out visitors too, and the base organizations table is
  // authenticated-only via RLS.
  const { data: org } = await fromUntyped(supabase, 'organizations_public_profile')
    .select('name, type')
    .eq('id', id)
    .maybeSingle();

  if (!org) {
    return {
      title: 'Program Not Found | Helm',
    };
  }

  return {
    title: `${org.name} Baseball | Helm`,
    description: `View ${org.name}'s baseball program profile, staff, and recruiting information.`,
  };
}

export default async function PublicProgramProfilePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // ============================================================
  // GATING: same tiered access as the sibling public team profile page —
  // - Logged-out visitors: SAFE public view (org identity, coaching staff
  //   name+role+avatar). Roster stays gated.
  // - Authenticated college/juco (recruiting) coaches: full current
  //   behavior, unchanged.
  // - Any other authenticated user: unchanged pre-existing block — this
  //   task only widens access for LOGGED-OUT visitors, per product
  //   decision.
  // ============================================================
  const { isPublicViewer, coach } = await resolveRecruitingViewerAccess(supabase);

  interface OrganizationCore {
    id: string;
    name: string;
    type: string;
    division: string | null;
    conference: string | null;
    location_city: string | null;
    location_state: string | null;
    logo_url: string | null;
    description: string | null;
    website_url: string | null;
  }

  let organization: OrganizationCore;

  if (isPublicViewer) {
    // ------------------------------------------------------------
    // ANON PATH: read exclusively through the anon-safe public view
    // (supabase/migrations/20260702110000_baseball_public_team_program_profile_views.sql,
    // db_gated). The base organizations table is authenticated-only via RLS.
    // ------------------------------------------------------------
    const { data: publicOrg } = await fromUntyped(supabase, 'organizations_public_profile')
      .select('id, name, type, division, conference, location_city, location_state, logo_url, description, website_url')
      .eq('id', id)
      .maybeSingle();

    if (!publicOrg) {
      notFound();
    }
    organization = publicOrg;
  } else {
    // ------------------------------------------------------------
    // AUTHENTICATED RECRUITING COACH PATH: unchanged from prior behavior.
    // Note: organization_settings, organization_staff, organization_facilities,
    // and program_commitments tables don't exist yet - will be added in future
    // ------------------------------------------------------------
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      notFound();
    }
    organization = data;
  }

  const showDescription = true;

  // Fetch real coaching staff via baseball_team_coach_staff → baseball_coaches.
  // Authenticated recruiting coaches get full identity (name, title, bio,
  // headshot) via the base tables; logged-out visitors get the SAFE subset
  // (name, role, avatar — no bio) via the anon-readable public view.
  type CoachStaffMember = {
    id: string;
    name: string;
    title: string;
    bio: string | null;
    headshot_url: string | null;
    is_primary: boolean;
  };

  const staff: CoachStaffMember[] = [];

  if (isPublicViewer) {
    const { data: publicTeams } = await fromUntyped(supabase, 'baseball_teams_public_profile')
      .select('id')
      .eq('organization_id', id);

    const teamIds = ((publicTeams ?? []) as { id: string }[]).map((t) => t.id);

    if (teamIds.length > 0) {
      const { data: publicStaffRows } = await fromUntyped(supabase, 'baseball_team_coach_staff_public')
        .select('coach_id, is_primary, role, full_name, avatar_url')
        .in('team_id', teamIds);

      if (publicStaffRows) {
        const seen = new Set<string>();
        const sorted = [...publicStaffRows].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
        sorted.forEach((row) => {
          const coachId = row.coach_id as string | null;
          if (!coachId || seen.has(coachId)) return;
          seen.add(coachId);
          staff.push({
            id: coachId,
            name: (row.full_name as string | null)?.trim() || 'Coach',
            title: row.is_primary ? 'Head Coach' : ((row.role as string | null) ?? 'Assistant Coach'),
            bio: null,
            headshot_url: row.avatar_url as string | null,
            is_primary: row.is_primary ?? false,
          });
        });
      }
    }
  } else {
    // Get teams for this org, then fetch coach staff
    // NOTE: baseball_coaches has `full_name`, not first_name/last_name — do not
    // select first_name/last_name here, PostgREST will 400 (see database.ts
    // baseball_coaches.Row; see also the sibling team/[id]/page.tsx fix).
    const { data: orgTeams } = await supabase
      .from('baseball_teams')
      .select('id, name')
      .eq('organization_id', id);

    if (orgTeams && orgTeams.length > 0) {
      const teamIds = orgTeams.map((t) => t.id);
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
        .in('team_id', teamIds);

      if (staffRows) {
        const seen = new Set<string>();
        // Sort: primary coaches first
        const sorted = [...staffRows].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
        sorted.forEach((row) => {
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
            is_primary: row.is_primary ?? false,
          });
        });
      }
    }
  }

  return (
    <div className="min-h-dvh bg-[#FAF6F1]">
      {/* Header */}
      <div className="bg-cream-50 border-b border-warm-200">
        <div className="max-w-[720px] mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <span className="font-semibold text-warm-900">Helm</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[720px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Program Header */}
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-br from-primary-50 to-white p-8 border-b border-warm-200">
                <div className="flex items-start gap-6">
                  {organization.logo_url ? (
                    <Image
                      src={organization.logo_url}
                      alt={organization.name}
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
                      {organization.name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {organization.division && (
                        <Badge variant="success">{organization.division}</Badge>
                      )}
                      {organization.conference && (
                        <Badge variant="secondary">{organization.conference}</Badge>
                      )}
                      <Badge>{organization.type}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-warm-600">
                      <IconMapPin size={16} />
                      <span className="text-sm">
                        {organization.location_city}, {organization.location_state}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {showDescription && organization.description && (
                <div className="p-6 bg-cream-50">
                  <h2 className="text-lg font-semibold tracking-tight text-warm-900 mb-3">About</h2>
                  <p className="text-warm-600 leading-relaxed whitespace-pre-line">
                    {organization.description}
                  </p>
                </div>
              )}
            </Card>

            {/* Tabs: Overview and Roster */}
            <ProgramTabs
              coachType={coach?.coach_type}
              overviewContent={
                <div className="space-y-6">
                  {/* Coaching Staff */}
                  {staff.length > 0 && (
                    <Card className="overflow-hidden">
                      <div className="p-6 border-b border-warm-200 bg-cream-50">
                        <div className="flex items-center gap-2">
                          <IconUsers size={20} className="text-primary-600" />
                          <h2 className="text-lg font-semibold tracking-tight text-warm-900">Coaching Staff</h2>
                        </div>
                      </div>
                      <div className="p-6 bg-warm-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {staff.map((member: CoachStaffMember) => (
                            <div
                              key={member.id}
                              className="bg-cream-50 rounded-lg border border-warm-200 p-4"
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

                  {/* Empty state when no additional info */}
                  {/* Facilities and Commitments sections were removed (W4d): the
                      backing tables (organization_facilities, program_commitments)
                      don't exist yet, so those sections rendered permanently-empty
                      UI that could never show real data. A future feature re-adds
                      them once the tables + read paths exist. */}
                  {staff.length === 0 && (
                    <Card className="p-8 text-center">
                      <p className="text-warm-500">No additional program information available.</p>
                    </Card>
                  )}
                </div>
              }
              rosterContent={
                isPublicViewer ? (
                  <Card className="p-8 text-center">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-warm-100 flex items-center justify-center">
                      <IconLock size={28} className="text-warm-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-warm-900 mb-2">
                      Sign in to view roster
                    </h3>
                    <p className="text-sm text-warm-500 max-w-sm mx-auto mb-4">
                      Roster details are visible to verified college and JUCO coaches.
                    </p>
                    <Link
                      href={`/baseball/login?returnTo=${encodeURIComponent(`/baseball/program/${id}`)}`}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary-600 px-5 py-2.5 min-h-[44px] text-sm font-medium text-white shadow-sm transition-all duration-200 ease-out hover:bg-primary-700 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                    >
                      Sign in
                    </Link>
                  </Card>
                ) : (
                  <ProgramRoster
                    organizationId={organization.id}
                    organizationType={organization.type || 'high_school'}
                    coachType={coach?.coach_type}
                  />
                )
              }
            />
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Contact Card */}
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-warm-900 uppercase tracking-wide mb-4">
                Contact
              </h3>
              {organization.website_url && (
                <div className="mb-4">
                  <a
                    href={organization.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm leading-relaxed text-primary-600 hover:text-primary-700 hover:underline break-all"
                  >
                    Visit Website
                  </a>
                </div>
              )}
              <Button className="w-full">
                <IconMail size={16} />
                Contact Program
              </Button>
            </Card>

            {/* Quick Facts */}
            <Card className="p-6 bg-gradient-to-br from-primary-50 to-white">
              <h3 className="text-sm font-semibold text-warm-900 uppercase tracking-wide mb-4">
                Quick Facts
              </h3>
              <div className="space-y-3">
                {organization.division && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm leading-relaxed text-warm-600">Division</span>
                    <span className="text-sm font-semibold text-warm-900">
                      {organization.division}
                    </span>
                  </div>
                )}
                {organization.conference && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm leading-relaxed text-warm-600">Conference</span>
                    <span className="text-sm font-semibold text-warm-900">
                      {organization.conference}
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
          </div>
        </div>
      </div>
    </div>
  );
}
