'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Player, Team } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Progress } from '@/components/ui/progress';
import {
  IconUser,
  IconActivity,
  IconGraduationCap,
  IconInstagram,
  IconTwitter,
  IconMail,
  IconPhone,
  IconMapPin,
  IconCheck,
  IconUsers,
} from '@/components/icons';

interface CollegeProfileEditorProps {
  player: Player;
  onUpdate: (updates: Partial<Player>) => Promise<void>;
  className?: string;
}

type TabId = 'personal' | 'athletic' | 'academic' | 'social';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'personal', label: 'Personal', icon: <IconUser size={16} /> },
  { id: 'athletic', label: 'Athletic', icon: <IconActivity size={16} /> },
  { id: 'academic', label: 'Academic', icon: <IconGraduationCap size={16} /> },
  { id: 'social', label: 'Social', icon: <IconMail size={16} /> },
];

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'IF', 'UTL'];

interface TeamMembership {
  team: Team;
  jersey_number: number | null;
  position: string | null;
}

// Profile completion calculation
function calculateProfileCompletion(player: Player): { percentage: number; missingFields: string[] } {
  const fields = [
    { key: 'first_name', label: 'First Name', required: true },
    { key: 'last_name', label: 'Last Name', required: true },
    { key: 'city', label: 'City', required: false },
    { key: 'state', label: 'State', required: true },
    { key: 'primary_position', label: 'Position', required: true },
    { key: 'height_feet', label: 'Height', required: false },
    { key: 'weight_lbs', label: 'Weight', required: false },
    { key: 'bats', label: 'Bats', required: false },
    { key: 'throws', label: 'Throws', required: false },
    { key: 'gpa', label: 'GPA', required: false },
    { key: 'email', label: 'Email', required: true },
    { key: 'about_me', label: 'About Me', required: false },
    { key: 'avatar_url', label: 'Profile Photo', required: false },
  ];

  const missingFields: string[] = [];
  let filledCount = 0;

  fields.forEach(({ key, label }) => {
    const value = player[key as keyof Player];
    if (value !== null && value !== undefined && value !== '') {
      filledCount++;
    } else {
      missingFields.push(label);
    }
  });

  return {
    percentage: Math.round((filledCount / fields.length) * 100),
    missingFields,
  };
}

export function CollegeProfileEditor({ player, onUpdate, className }: CollegeProfileEditorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('personal');
  const [formData, setFormData] = useState<Partial<Player>>(player);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);

  const { percentage: profileCompletion, missingFields } = calculateProfileCompletion({
    ...player,
    ...formData,
  } as Player);

  // Fetch team memberships
  useEffect(() => {
    async function fetchTeamMemberships() {
      if (!player?.id) {
        setLoadingTeams(false);
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from('baseball_team_members')
        .select(`
          jersey_number,
          position,
          baseball_teams (
            id,
            name,
            team_type,
            logo_url,
            primary_color
          )
        `)
        .eq('player_id', player.id)
        .eq('status', 'active');

      if (!error && data) {
        const memberships = data
          .map((item) => ({
            team: item.baseball_teams as unknown as Team,
            jersey_number: item.jersey_number,
            position: item.position,
          }))
          .filter((m) => m.team !== null);
        setTeamMemberships(memberships);
      }
      setLoadingTeams(false);
    }

    fetchTeamMemberships();
  }, [player?.id]);

  const handleInputChange = (field: keyof Player, value: string | number | boolean | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await onUpdate(formData);
      setSaveMessage('Profile updated successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage('Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Profile Completion & Team Affiliation Header */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Profile Completion Card */}
        <div className="glass-standard rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            }}
          />
          <div className="flex items-center gap-4">
            <ProgressRing
              value={profileCompletion}
              size="lg"
              color={profileCompletion >= 80 ? 'green' : profileCompletion >= 50 ? 'amber' : 'red'}
              label="Complete"
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-900">Profile Completion</h3>
              {profileCompletion < 100 ? (
                <div className="mt-1">
                  <p className="text-sm text-slate-600">
                    Add {missingFields.slice(0, 2).join(', ')}
                    {missingFields.length > 2 && ` +${missingFields.length - 2} more`}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-primary-600 flex items-center gap-1.5 mt-1">
                  <IconCheck size={14} />
                  Profile complete!
                </p>
              )}
            </div>
          </div>
          {profileCompletion < 100 && (
            <div className="mt-4">
              <Progress value={profileCompletion} size="sm" showPercentage={false} />
            </div>
          )}
        </div>

        {/* Team Affiliation Card */}
        <div className="glass-standard rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            }}
          />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <IconUsers size={20} className="text-primary-600" />
            </div>
            <h3 className="font-semibold text-slate-900">Team Affiliation</h3>
          </div>
          
          {loadingTeams ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-slate-200 rounded w-3/4"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
          ) : teamMemberships.length === 0 ? (
            <p className="text-sm text-slate-500">No team affiliations yet</p>
          ) : (
            <div className="space-y-3">
              {teamMemberships.map((membership, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {membership.team.logo_url ? (
                      <img
                        src={membership.team.logo_url}
                        alt={membership.team.name}
                        className="w-8 h-8 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: membership.team.primary_color || '#6366f1' }}
                      >
                        {membership.team.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{membership.team.name}</p>
                      <p className="text-xs text-slate-500 capitalize">
                        {membership.team.team_type?.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {membership.jersey_number && (
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-bold text-sm">
                        #{membership.jersey_number}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Editor Card */}
      <div className="glass-standard rounded-2xl overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
        
        {/* Tab Navigation */}
        <div className="border-b border-border">
          <div className="flex gap-1 p-2 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 hover:bg-cream-100 active:bg-cream-200'
                )}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {activeTab === 'personal' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <IconUser size={20} className="text-slate-400" />
                Personal Information
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name *</label>
                  <input
                    type="text"
                    value={formData.first_name || ''}
                    onChange={(e) => handleInputChange('first_name', e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name *</label>
                  <input
                    type="text"
                    value={formData.last_name || ''}
                    onChange={(e) => handleInputChange('last_name', e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <IconMapPin size={14} className="text-slate-400" />
                      City
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.city || ''}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">State *</label>
                  <select
                    value={formData.state || ''}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                    required
                  >
                    <option value="">Select State</option>
                    {US_STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">About Me</label>
                <textarea
                  value={formData.about_me || ''}
                  onChange={(e) => handleInputChange('about_me', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50 resize-none"
                  placeholder="Share your story, goals, and what drives you as a player..."
                />
                <p className="text-xs text-slate-500 mt-1">This appears on your public profile</p>
              </div>
            </div>
          )}

          {activeTab === 'athletic' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <IconActivity size={20} className="text-slate-400" />
                Athletic Information
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Primary Position *</label>
                  <select
                    value={formData.primary_position || ''}
                    onChange={(e) => handleInputChange('primary_position', e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                    required
                  >
                    <option value="">Select Position</option>
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Secondary Position</label>
                  <select
                    value={formData.secondary_position || ''}
                    onChange={(e) => handleInputChange('secondary_position', e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                  >
                    <option value="">Select Position</option>
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Bats</label>
                  <select
                    value={formData.bats || ''}
                    onChange={(e) => handleInputChange('bats', e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                  >
                    <option value="">-</option>
                    <option value="R">Right</option>
                    <option value="L">Left</option>
                    <option value="S">Switch</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Throws</label>
                  <select
                    value={formData.throws || ''}
                    onChange={(e) => handleInputChange('throws', e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                  >
                    <option value="">-</option>
                    <option value="R">Right</option>
                    <option value="L">Left</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Height</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      placeholder="Ft"
                      min="4"
                      max="7"
                      value={formData.height_feet || ''}
                      onChange={(e) => handleInputChange('height_feet', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-1/2 px-2 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50 text-center"
                    />
                    <input
                      type="number"
                      placeholder="In"
                      min="0"
                      max="11"
                      value={formData.height_inches || ''}
                      onChange={(e) => handleInputChange('height_inches', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-1/2 px-2 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50 text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Weight</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.weight_lbs || ''}
                      onChange={(e) => handleInputChange('weight_lbs', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50 pr-10"
                      placeholder="185"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">lbs</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4 mt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Performance Metrics</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Pitch Velo</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={formData.pitch_velo || ''}
                        onChange={(e) => handleInputChange('pitch_velo', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50 pr-12"
                        placeholder="85"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">mph</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Exit Velo</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={formData.exit_velo || ''}
                        onChange={(e) => handleInputChange('exit_velo', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50 pr-12"
                        placeholder="90"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">mph</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">60-Yard</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={formData.sixty_time || ''}
                        onChange={(e) => handleInputChange('sixty_time', e.target.value ? parseFloat(e.target.value) : null)}
                        className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50 pr-10"
                        placeholder="7.2"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">sec</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Pop Time</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={formData.pop_time || ''}
                        onChange={(e) => handleInputChange('pop_time', e.target.value ? parseFloat(e.target.value) : null)}
                        className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50 pr-10"
                        placeholder="2.0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">sec</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'academic' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <IconGraduationCap size={20} className="text-slate-400" />
                Academic Information
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">GPA</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4.0"
                    value={formData.gpa || ''}
                    onChange={(e) => handleInputChange('gpa', e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                    placeholder="3.50"
                  />
                  <p className="text-xs text-slate-500 mt-1">Current cumulative GPA</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Graduation Year</label>
                  <input
                    type="number"
                    value={formData.grad_year || ''}
                    onChange={(e) => handleInputChange('grad_year', e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                    placeholder={String(new Date().getFullYear() + 1)}
                    min={new Date().getFullYear()}
                    max={new Date().getFullYear() + 6}
                  />
                  <p className="text-xs text-slate-500 mt-1">Expected graduation year</p>
                </div>
              </div>

              {/* High School Info (read-only for college players) */}
              {player.high_school_name && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mt-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">High School Background</p>
                  <p className="text-sm text-slate-700">
                    {player.high_school_name}
                    {player.high_school_city && `, ${player.high_school_city}`}
                    {player.high_school_state && `, ${player.high_school_state}`}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'social' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <IconMail size={20} className="text-slate-400" />
                Contact & Social
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <IconMail size={14} className="text-slate-400" />
                      Email *
                    </span>
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <IconPhone size={14} className="text-slate-400" />
                      Phone
                    </span>
                  </label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <IconTwitter size={14} className="text-slate-400" />
                      Twitter
                    </span>
                  </label>
                  <div className="flex items-center">
                    <span className="px-3 py-2.5 bg-slate-100 border border-r-0 border-border rounded-l-lg text-slate-500 text-sm">@</span>
                    <input
                      type="text"
                      value={formData.twitter || ''}
                      onChange={(e) => handleInputChange('twitter', e.target.value)}
                      className="flex-1 px-3 py-2.5 border border-border rounded-r-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                      placeholder="username"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <IconInstagram size={14} className="text-slate-400" />
                      Instagram
                    </span>
                  </label>
                  <div className="flex items-center">
                    <span className="px-3 py-2.5 bg-slate-100 border border-r-0 border-border rounded-l-lg text-slate-500 text-sm">@</span>
                    <input
                      type="text"
                      value={formData.instagram || ''}
                      onChange={(e) => handleInputChange('instagram', e.target.value)}
                      className="flex-1 px-3 py-2.5 border border-border rounded-r-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white/50"
                      placeholder="username"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-6 border-t border-border">
            <div className="order-2 sm:order-1">
              {saveMessage && (
                <p className={cn(
                  'text-sm font-medium flex items-center gap-1.5',
                  saveMessage.includes('successfully') ? 'text-primary-600' : 'text-red-600'
                )}>
                  {saveMessage.includes('successfully') && <IconCheck size={14} />}
                  {saveMessage}
                </p>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={cn(
                'w-full sm:w-auto order-1 sm:order-2 px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg transition-all',
                isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-brand-700 active:scale-[0.98]'
              )}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
