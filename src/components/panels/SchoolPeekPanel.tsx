'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { usePeekPanelStore } from '@/stores/peek-panel-store';
import {
  IconX,
  IconMapPin,
  IconExternalLink,
  IconGlobe,
  IconMail,
  IconPhone,
  IconUsers,
  IconSchool,
  IconBuilding,
  IconHeart,
} from '@/components/icons';

interface Organization {
  id: string;
  name: string;
  type: string;
  division: string | null;
  conference: string | null;
  location_city: string | null;
  location_state: string | null;
  logo_url: string | null;
  banner_url: string | null;
  description: string | null;
  website_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

interface Coach {
  id: string;
  full_name: string | null;
  coach_title: string | null;
  avatar_url: string | null;
  email_contact: string | null;
  phone: string | null;
}

export function SchoolPeekPanel() {
  const { isOpen, panelType, selectedId, closePanel } = usePeekPanelStore();
  const [school, setSchool] = useState<Organization | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  // Fetch school data when panel opens
  useEffect(() => {
    async function fetchSchool() {
      if (!selectedId || panelType !== 'school') {
        setSchool(null);
        setCoaches([]);
        return;
      }

      setLoading(true);

      // Fetch organization
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', selectedId)
        .single();

      if (orgError) {
        console.error('Error fetching organization:', orgError);
        setSchool(null);
      } else {
        setSchool(orgData as Organization);

        // Fetch coaches for this organization
        const { data: coachData } = await supabase
          .from('coaches')
          .select('id, full_name, coach_title, avatar_url, email_contact, phone')
          .eq('organization_id', selectedId)
          .limit(5);

        setCoaches((coachData as Coach[]) || []);
      }
      setLoading(false);
    }

    fetchSchool();
  }, [selectedId, panelType]);

  // Handle escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        closePanel();
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, closePanel]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (panelType !== 'school') return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closePanel}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-slate-900">School Preview</h2>
          <button
            onClick={closePanel}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-73px)]">
          {loading ? (
            <div className="p-6 space-y-4">
              <div className="h-32 bg-slate-200 rounded-xl animate-pulse" />
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-slate-200 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-32 bg-slate-200 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
            </div>
          ) : school ? (
            <div className="space-y-6">
              {/* Banner */}
              <div
                className="h-32 bg-gradient-to-br from-slate-600 to-slate-800 relative"
                style={{
                  backgroundColor: school.primary_color || undefined,
                }}
              >
                {school.banner_url && (
                  <img
                    src={school.banner_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              </div>

              <div className="px-6 space-y-6">
                {/* School Header */}
                <div className="flex items-start gap-4 -mt-10 relative z-10">
                  <div className="w-16 h-16 rounded-xl bg-white shadow-md flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-white">
                    {school.logo_url ? (
                      <img
                        src={school.logo_url}
                        alt=""
                        className="w-full h-full object-contain p-2"
                      />
                    ) : (
                      <IconSchool size={24} className="text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-8">
                    <h3 className="text-xl font-semibold text-slate-900">
                      {school.name}
                    </h3>
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                      {school.division && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          {school.division}
                        </span>
                      )}
                      {school.conference && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                          {school.conference}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2">
                  <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors">
                    <IconHeart size={16} />
                    <span>Add to List</span>
                  </button>
                  {school.website_url && (
                    <a
                      href={school.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                    >
                      <IconGlobe size={16} />
                    </a>
                  )}
                </div>

                {/* Location */}
                {(school.location_city || school.location_state) && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <IconMapPin size={16} className="text-slate-400" />
                    <span>
                      {[school.location_city, school.location_state]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}

                {/* Description */}
                {school.description && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">
                      About the Program
                    </h4>
                    <p className="text-sm text-slate-600 leading-relaxed line-clamp-4">
                      {school.description}
                    </p>
                  </div>
                )}

                {/* Coaching Staff */}
                {coaches.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-slate-900">
                        Coaching Staff
                      </h4>
                      <span className="text-xs text-slate-500">
                        {coaches.length} coach{coaches.length !== 1 ? 'es' : ''}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {coaches.map((coach) => (
                        <div
                          key={coach.id}
                          className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"
                        >
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {coach.avatar_url ? (
                              <img
                                src={coach.avatar_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <IconUsers size={16} className="text-slate-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-slate-900 truncate">
                              {coach.full_name || 'Unknown'}
                            </div>
                            {coach.coach_title && (
                              <div className="text-xs text-slate-500">
                                {coach.coach_title}
                              </div>
                            )}
                          </div>
                          {coach.email_contact && (
                            <a
                              href={`mailto:${coach.email_contact}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              <IconMail size={14} />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Info */}
                <div className="grid grid-cols-2 gap-3">
                  <InfoCard
                    icon={<IconBuilding size={16} className="text-green-600" />}
                    label="Type"
                    value={school.type || 'College'}
                  />
                  {school.division && (
                    <InfoCard
                      icon={<IconSchool size={16} className="text-green-600" />}
                      label="Division"
                      value={school.division}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-500">
              <p>School not found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {school && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4">
            <Link
              href={`/program/${school.id}`}
              onClick={closePanel}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors"
            >
              <span>View Full Profile</span>
              <IconExternalLink size={16} />
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
