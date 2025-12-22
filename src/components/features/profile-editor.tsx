'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Player } from '@/lib/types';

interface ProfileEditorProps {
  player: Player;
  onUpdate: (updates: Partial<Player>) => Promise<void>;
  className?: string;
}

type TabId = 'personal' | 'athletic' | 'academic' | 'videos' | 'social';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'personal', label: 'Personal Info' },
  { id: 'athletic', label: 'Athletic Info' },
  { id: 'academic', label: 'Academic Info' },
  { id: 'videos', label: 'Videos' },
  { id: 'social', label: 'Social & Contact' },
];

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

const GRAD_YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'IF', 'UTL'];

export function ProfileEditor({ player, onUpdate, className }: ProfileEditorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('personal');
  const [formData, setFormData] = useState<Partial<Player>>(player);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleInputChange = (field: keyof Player, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
    <div className={cn('bg-white rounded-xl border border-border', className)}>
      {/* Tab Navigation */}
      <div className="border-b border-border">
        <div className="flex gap-1 p-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                activeTab === tab.id
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-cream-100'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'personal' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Personal Information</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                <input
                  type="text"
                  value={formData.first_name || ''}
                  onChange={(e) => handleInputChange('first_name', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                <input
                  type="text"
                  value={formData.last_name || ''}
                  onChange={(e) => handleInputChange('last_name', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">State *</label>
                <select
                  value={formData.state || ''}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  required
                >
                  <option value="">Select State</option>
                  {US_STATES.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">High School *</label>
              <input
                type="text"
                value={formData.high_school_name || ''}
                onChange={(e) => handleInputChange('high_school_name', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">About Me</label>
              <textarea
                value={formData.about_me || ''}
                onChange={(e) => handleInputChange('about_me', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Tell coaches about yourself..."
              />
            </div>
          </div>
        )}

        {activeTab === 'athletic' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Athletic Information</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Position *</label>
                <select
                  value={formData.primary_position || ''}
                  onChange={(e) => handleInputChange('primary_position', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  required
                >
                  <option value="">Select Position</option>
                  {POSITIONS.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Graduation Year *</label>
                <select
                  value={formData.grad_year || ''}
                  onChange={(e) => handleInputChange('grad_year', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  required
                >
                  <option value="">Select Year</option>
                  {GRAD_YEARS.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bats</label>
                <select
                  value={formData.bats || ''}
                  onChange={(e) => handleInputChange('bats', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">Select</option>
                  <option value="R">Right</option>
                  <option value="L">Left</option>
                  <option value="S">Switch</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Throws</label>
                <select
                  value={formData.throws || ''}
                  onChange={(e) => handleInputChange('throws', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">Select</option>
                  <option value="R">Right</option>
                  <option value="L">Left</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Height</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Feet"
                    min="4"
                    max="7"
                    value={formData.height_feet || ''}
                    onChange={(e) => handleInputChange('height_feet', e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                  <input
                    type="number"
                    placeholder="Inches"
                    min="0"
                    max="11"
                    value={formData.height_inches || ''}
                    onChange={(e) => handleInputChange('height_inches', e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Weight (lbs)</label>
                <input
                  type="number"
                  value={formData.weight_lbs || ''}
                  onChange={(e) => handleInputChange('weight_lbs', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="185"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pitch Velocity (mph)</label>
                <input
                  type="number"
                  value={formData.pitch_velo || ''}
                  onChange={(e) => handleInputChange('pitch_velo', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="85"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Exit Velocity (mph)</label>
                <input
                  type="number"
                  value={formData.exit_velo || ''}
                  onChange={(e) => handleInputChange('exit_velo', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="90"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">60-Yard Time (sec)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sixty_time || ''}
                  onChange={(e) => handleInputChange('sixty_time', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="7.2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pop Time (sec)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.pop_time || ''}
                  onChange={(e) => handleInputChange('pop_time', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="2.0"
                />
                <p className="text-xs text-slate-500 mt-1">For catchers</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Travel Team</label>
              <input
                type="text"
                value={formData.club_team || ''}
                onChange={(e) => handleInputChange('club_team', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Showcase or travel team"
              />
            </div>
          </div>
        )}

        {activeTab === 'academic' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Academic Information</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">GPA</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="4.0"
                  value={formData.gpa || ''}
                  onChange={(e) => handleInputChange('gpa', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="3.75"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">SAT Score</label>
                <input
                  type="number"
                  value={formData.sat_score || ''}
                  onChange={(e) => handleInputChange('sat_score', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="1200"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ACT Score</label>
              <input
                type="number"
                value={formData.act_score || ''}
                onChange={(e) => handleInputChange('act_score', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="28"
              />
            </div>

          </div>
        )}

        {activeTab === 'videos' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Video Settings</h3>

            <div className="bg-cream-50 rounded-lg p-4 border border-border">
              <p className="text-sm leading-relaxed text-slate-600 mb-3">
                Manage your highlight videos and game footage from the Videos page in your dashboard.
              </p>
              <a
                href="/baseball/dashboard/videos"
                className="inline-block px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
              >
                Go to Videos
              </a>
            </div>

            <div className="pt-4 border-t border-border">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.has_video || false}
                  onChange={(e) => handleInputChange('has_video', e.target.checked)}
                  className="w-4 h-4 text-brand-600 border-border rounded focus:ring-brand-600"
                />
                <span className="text-sm font-medium text-slate-700">
                  I have highlight videos uploaded
                </span>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'social' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Social & Contact Information</h3>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Twitter Handle</label>
              <div className="flex items-center">
                <span className="px-3 py-2 bg-slate-100 border border-r-0 border-border rounded-l-lg text-slate-600">@</span>
                <input
                  type="text"
                  value={formData.twitter || ''}
                  onChange={(e) => handleInputChange('twitter', e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-r-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Instagram Handle</label>
              <div className="flex items-center">
                <span className="px-3 py-2 bg-slate-100 border border-r-0 border-border rounded-l-lg text-slate-600">@</span>
                <input
                  type="text"
                  value={formData.instagram || ''}
                  onChange={(e) => handleInputChange('instagram', e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-r-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="username"
                />
              </div>
            </div>

          </div>
        )}

        {/* Save Button */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
          <div>
            {saveMessage && (
              <p className={cn(
                'text-sm font-medium',
                saveMessage.includes('successfully') ? 'text-green-600' : 'text-red-600'
              )}>
                {saveMessage}
              </p>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'px-6 py-2 bg-brand-600 text-white font-medium rounded-lg transition-colors',
              isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-brand-700'
            )}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
