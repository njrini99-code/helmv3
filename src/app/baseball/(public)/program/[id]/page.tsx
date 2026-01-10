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

  // Fetch organization with settings and related data
  const { data: organization, error } = await supabase
    .from('organizations')
    .select(`
      *,
      organization_settings (*),
      organization_staff (
        id,
        name,
        title,
        bio,
        headshot_url,
        email,
        phone,
        display_order,
        is_public
      ),
      organization_facilities (
        id,
        name,
        facility_type,
        description,
        capacity,
        image_url,
        display_order
      ),
      program_commitments (
        id,
        player_name,
        position,
        grad_year,
        high_school,
        city,
        state,
        commitment_date,
        is_signed
      )
    `)
    .eq('id', id)
    .single();

  if (error || !organization) {
    notFound();
  }

  type OrganizationSettings = {
    show_description?: boolean;
    show_staff_bios?: boolean;
    show_staff_photos?: boolean;
    show_facilities?: boolean;
    show_commitments?: boolean;
  };

  const settings = ((organization as unknown as { organization_settings?: OrganizationSettings }).organization_settings || {}) as OrganizationSettings;
  const showDescription = settings.show_description !== false;
  const showStaffBios = settings.show_staff_bios !== false;
  const showStaffPhotos = settings.show_staff_photos !== false;
  const showFacilities = settings.show_facilities !== false;
  const showCommitments = settings.show_commitments !== false;

  // Sort staff by display order
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

  const staff = ((organization as unknown as { organization_staff?: OrganizationStaff[] }).organization_staff || [])
    .filter((s: OrganizationStaff) => s.is_public)
    .sort((a: OrganizationStaff, b: OrganizationStaff) => a.display_order - b.display_order);

  // Sort facilities by display order
  type OrganizationFacility = {
    id: string;
    name: string;
    facility_type: string | null;
    description: string | null;
    capacity: number | null;
    image_url: string | null;
    display_order: number;
  };

  const facilities = ((organization as unknown as { organization_facilities?: OrganizationFacility[] }).organization_facilities || [])
    .sort((a: OrganizationFacility, b: OrganizationFacility) => a.display_order - b.display_order);

  // Filter public commitments
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

  const commitments = ((organization as unknown as { program_commitments?: ProgramCommitment[] }).program_commitments || [])
    .filter((c: ProgramCommitment) => c.is_public);

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
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
              <div className="bg-gradient-to-br from-green-50 to-white p-8 border-b border-slate-200">
                <div className="flex items-start gap-6">
                  {organization.logo_url ? (
                    <img
                      src={organization.logo_url}
                      alt={organization.name}
                      className="w-24 h-24 rounded-lg object-cover border-2 border-white shadow-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-green-600 flex items-center justify-center shadow-lg">
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

            {/* Coaching Staff */}
            {staff.length > 0 && (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-200 bg-white">
                  <div className="flex items-center gap-2">
                    <IconUsers size={20} className="text-green-600" />
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
                          {showStaffPhotos && member.headshot_url ? (
                            <img
                              src={member.headshot_url}
                              alt={member.name}
                              className="w-16 h-16 rounded-full object-cover"
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
                            <p className="text-sm leading-relaxed text-green-600 mb-2">{member.title}</p>
                            {showStaffBios && member.bio && (
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
            {showFacilities && facilities.length > 0 && (
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
                          <img
                            src={facility.image_url}
                            alt={facility.name}
                            className="w-full h-40 object-cover"
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
            {showCommitments && commitments.length > 0 && (
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-200 bg-white">
                  <div className="flex items-center gap-2">
                    <IconStar size={20} className="text-green-600" />
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
                    className="text-sm leading-relaxed text-green-600 hover:text-green-700 hover:underline break-all"
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
            <Card className="p-6 bg-gradient-to-br from-green-50 to-white">
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
