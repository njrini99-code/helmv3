import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import {
  IconMapPin,
  IconMail,
  IconUsers,
  IconStar,
  IconBuilding,
} from '@/components/icons';
import { Metadata } from 'next';
import Image from 'next/image';
import { ProgramTabs } from '@/components/baseball/program/ProgramTabs';
import { ProgramRoster } from '@/components/baseball/program/ProgramRoster';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('name, type')
    .eq('id', id)
    .single();

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
  // AUTH CHECK: Only college/juco coaches can view program profiles
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

  // Fetch organization data
  // Note: organization_settings, organization_staff, organization_facilities,
  // and program_commitments tables don't exist yet - will be added in future
  const { data: organization, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !organization) {
    notFound();
  }

  // Default settings (tables don't exist yet)
  const showDescription = true;

  // Empty arrays for features not yet implemented
  // These will be populated when organization_staff, organization_facilities,
  // and program_commitments tables are created
  type OrganizationStaff = {
    id: string;
    name: string;
    title: string;
    bio: string | null;
    headshot_url: string | null;
    email: string | null;
    phone: string | null;
    display_order: number;
    is_public: boolean;
  };

  type OrganizationFacility = {
    id: string;
    name: string;
    facility_type: string | null;
    description: string | null;
    capacity: number | null;
    image_url: string | null;
    display_order: number;
  };

  type ProgramCommitment = {
    id: string;
    player_name: string;
    position: string;
    grad_year: number;
    high_school: string;
    city: string;
    state: string;
    commitment_date: string;
    is_signed: boolean;
    is_public?: boolean;
  };

  const staff: OrganizationStaff[] = [];
  const facilities: OrganizationFacility[] = [];
  const commitments: ProgramCommitment[] = [];

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">H</span>
              </div>
              <span className="font-semibold text-slate-900">Helm</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Program Header */}
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-br from-primary-50 to-white p-8 border-b border-slate-200">
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
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">
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
                    <div className="flex items-center gap-2 text-slate-600">
                      <IconMapPin size={16} />
                      <span className="text-sm">
                        {organization.location_city}, {organization.location_state}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {showDescription && organization.description && (
                <div className="p-6 bg-white">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900 mb-3">About</h2>
                  <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                    {organization.description}
                  </p>
                </div>
              )}
            </Card>

            {/* Tabs: Overview and Roster */}
            <ProgramTabs
              coachType={coach.coach_type}
              overviewContent={
                <div className="space-y-6">
                  {/* Coaching Staff */}
                  {staff.length > 0 && (
                    <Card className="overflow-hidden">
                      <div className="p-6 border-b border-slate-200 bg-white">
                        <div className="flex items-center gap-2">
                          <IconUsers size={20} className="text-primary-600" />
                          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Coaching Staff</h2>
                        </div>
                      </div>
                      <div className="p-6 bg-slate-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {staff.map((member: OrganizationStaff) => (
                            <div
                              key={member.id}
                              className="bg-white rounded-lg border border-slate-200 p-4"
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
                                  <h3 className="font-semibold text-slate-900 truncate">
                                    {member.name}
                                  </h3>
                                  <p className="text-sm leading-relaxed text-primary-600 mb-2">{member.title}</p>
                                  {member.bio && (
                                    <p className="text-xs text-slate-600 line-clamp-3">
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

                  {/* Facilities */}
                  {facilities.length > 0 && (
                    <Card className="overflow-hidden">
                      <div className="p-6 border-b border-slate-200 bg-white">
                        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Facilities</h2>
                      </div>
                      <div className="p-6 bg-slate-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {facilities.map((facility: OrganizationFacility) => (
                            <div
                              key={facility.id}
                              className="bg-white rounded-lg border border-slate-200 overflow-hidden"
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
                                <div className="w-full h-40 bg-slate-100 flex items-center justify-center">
                                  <IconBuilding size={32} className="text-slate-400" />
                                </div>
                              )}
                              <div className="p-4">
                                <h3 className="font-semibold text-slate-900 mb-1">
                                  {facility.name}
                                </h3>
                                {facility.capacity && (
                                  <p className="text-xs text-slate-500 mb-2">
                                    Capacity: {facility.capacity}
                                  </p>
                                )}
                                {facility.description && (
                                  <p className="text-sm leading-relaxed text-slate-600 line-clamp-2">
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

                  {/* Commitments */}
                  {commitments.length > 0 && (
                    <Card className="overflow-hidden">
                      <div className="p-6 border-b border-slate-200 bg-white">
                        <div className="flex items-center gap-2">
                          <IconStar size={20} className="text-primary-600" />
                          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                            Class of {new Date().getFullYear()} Commits
                          </h2>
                        </div>
                      </div>
                      <div className="p-6 bg-white">
                        <div className="divide-y divide-slate-200">
                          {commitments.slice(0, 10).map((commit: ProgramCommitment) => (
                            <div key={commit.id} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-slate-900">{commit.player_name}</p>
                                  <p className="text-sm leading-relaxed text-slate-600">
                                    {commit.position} • {commit.high_school}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {commit.city}, {commit.state}
                                  </p>
                                </div>
                                {commit.is_signed && (
                                  <Badge variant="success">Signed</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Empty state when no additional info */}
                  {staff.length === 0 && facilities.length === 0 && commitments.length === 0 && (
                    <Card className="p-8 text-center">
                      <p className="text-slate-500">No additional program information available.</p>
                    </Card>
                  )}
                </div>
              }
              rosterContent={
                <ProgramRoster
                  organizationId={organization.id}
                  organizationType={organization.type || 'high_school'}
                  coachType={coach.coach_type}
                />
              }
            />
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Contact Card */}
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">
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
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">
                Quick Facts
              </h3>
              <div className="space-y-3">
                {organization.division && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm leading-relaxed text-slate-600">Division</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {organization.division}
                    </span>
                  </div>
                )}
                {organization.conference && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm leading-relaxed text-slate-600">Conference</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {organization.conference}
                    </span>
                  </div>
                )}
                {staff.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm leading-relaxed text-slate-600">Coaching Staff</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {staff.length}
                    </span>
                  </div>
                )}
                {commitments.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm leading-relaxed text-slate-600">Commits</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {commitments.length}
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
