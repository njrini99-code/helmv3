'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface PlayerSettings {
  id?: string;
  player_id?: string;
  show_full_name?: boolean;
  show_location?: boolean;
  show_school?: boolean;
  show_contact_email?: boolean;
  show_phone?: boolean;
  show_social_links?: boolean;
  show_height_weight?: boolean;
  show_position?: boolean;
  show_grad_year?: boolean;
  show_bats_throws?: boolean;
  show_videos?: boolean;
  show_dream_schools?: boolean;
  show_calendar?: boolean;
  show_stats?: boolean;
  show_gpa?: boolean;
  show_test_scores?: boolean;
  allow_messages?: boolean;
  show_in_discover?: boolean;
}

interface PrivacySettingsFormProps {
  playerId: string;
  initialSettings?: PlayerSettings;
  onSave?: (settings: PlayerSettings) => void;
}

interface SettingGroup {
  title: string;
  description: string;
  settings: {
    key: keyof PlayerSettings;
    label: string;
    description: string;
  }[];
}

const SETTING_GROUPS: SettingGroup[] = [
  {
    title: 'Profile Visibility',
    description: 'Control what information appears on your public profile',
    settings: [
      {
        key: 'show_full_name',
        label: 'Show Full Name',
        description: 'Display your full name (otherwise shows first name and last initial)',
      },
      {
        key: 'show_location',
        label: 'Show Location',
        description: 'Display your city and state',
      },
      {
        key: 'show_school',
        label: 'Show School',
        description: 'Display your high school or current school',
      },
      {
        key: 'show_position',
        label: 'Show Position',
        description: 'Display your primary and secondary positions',
      },
      {
        key: 'show_grad_year',
        label: 'Show Graduation Year',
        description: 'Display your class year',
      },
    ],
  },
  {
    title: 'Physical Information',
    description: 'Control visibility of physical stats',
    settings: [
      {
        key: 'show_height_weight',
        label: 'Show Height & Weight',
        description: 'Display your physical measurements',
      },
      {
        key: 'show_bats_throws',
        label: 'Show Bats/Throws',
        description: 'Display your batting and throwing preferences',
      },
    ],
  },
  {
    title: 'Academic Information',
    description: 'Control visibility of academic data',
    settings: [
      {
        key: 'show_gpa',
        label: 'Show GPA',
        description: 'Display your grade point average',
      },
      {
        key: 'show_test_scores',
        label: 'Show Test Scores',
        description: 'Display SAT/ACT scores',
      },
    ],
  },
  {
    title: 'Contact Information',
    description: 'Control who can see your contact details',
    settings: [
      {
        key: 'show_contact_email',
        label: 'Show Email Address',
        description: 'Display your email on your public profile',
      },
      {
        key: 'show_phone',
        label: 'Show Phone Number',
        description: 'Display your phone number on your public profile',
      },
      {
        key: 'show_social_links',
        label: 'Show Social Media',
        description: 'Display your Twitter/Instagram handles',
      },
    ],
  },
  {
    title: 'Content Visibility',
    description: 'Control what content appears on your profile',
    settings: [
      {
        key: 'show_videos',
        label: 'Show Videos',
        description: 'Display your highlight videos and clips',
      },
      {
        key: 'show_stats',
        label: 'Show Statistics',
        description: 'Display your performance statistics',
      },
      {
        key: 'show_dream_schools',
        label: 'Show Dream Schools',
        description: 'Display your list of top college choices',
      },
      {
        key: 'show_calendar',
        label: 'Show Calendar',
        description: 'Display your schedule and availability',
      },
    ],
  },
  {
    title: 'Recruiting Settings',
    description: 'Control recruiting-related visibility',
    settings: [
      {
        key: 'show_in_discover',
        label: 'Appear in Discover',
        description: 'Allow coaches to find you in the Discover section',
      },
      {
        key: 'allow_messages',
        label: 'Allow Messages',
        description: 'Allow coaches to send you direct messages',
      },
    ],
  },
];

export function PrivacySettingsForm({
  playerId,
  initialSettings,
  onSave,
}: PrivacySettingsFormProps) {
  const [settings, setSettings] = useState<PlayerSettings>(
    initialSettings || {
      show_full_name: true,
      show_location: true,
      show_school: true,
      show_contact_email: false,
      show_phone: false,
      show_social_links: true,
      show_height_weight: true,
      show_position: true,
      show_grad_year: true,
      show_bats_throws: true,
      show_videos: true,
      show_dream_schools: true,
      show_calendar: false,
      show_stats: true,
      show_gpa: true,
      show_test_scores: true,
      allow_messages: true,
      show_in_discover: true,
    }
  );

  const [saving, setSaving] = useState(false);

  const handleToggle = (key: keyof PlayerSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    try {
      // Check if settings exist
      const { data: existing } = await supabase
        .from('player_settings')
        .select('id')
        .eq('player_id', playerId)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('player_settings')
          .update(settings)
          .eq('player_id', playerId);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('player_settings')
          .insert({ ...settings, player_id: playerId });

        if (error) throw error;
      }

      toast.success('Privacy settings saved successfully');
      onSave?.(settings);
    } catch (error) {
      console.error('Error saving privacy settings:', error);
      toast.error('Failed to save privacy settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {SETTING_GROUPS.map((group) => (
        <Card key={group.title} className="overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-white">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {group.title}
            </h3>
            <p className="text-sm text-slate-500">{group.description}</p>
          </div>

          <div className="p-6 space-y-4 bg-slate-50">
            {group.settings.map((setting) => (
              <div
                key={setting.key}
                className="flex items-start justify-between gap-4 p-4 bg-white rounded-lg border border-slate-200"
              >
                <div className="flex-1">
                  <label
                    htmlFor={setting.key}
                    className="text-sm font-medium text-slate-900 block mb-1 cursor-pointer"
                  >
                    {setting.label}
                  </label>
                  <p className="text-xs text-slate-500">{setting.description}</p>
                </div>

                {/* Toggle Switch */}
                <button
                  id={setting.key}
                  type="button"
                  role="switch"
                  aria-checked={settings[setting.key] === true}
                  onClick={() => handleToggle(setting.key)}
                  className={`
                    relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                    transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2
                    ${settings[setting.key] ? 'bg-green-600' : 'bg-slate-300'}
                  `}
                >
                  <span
                    className={`
                      pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                      transition duration-200 ease-in-out
                      ${settings[setting.key] ? 'translate-x-5' : 'translate-x-0'}
                    `}
                  />
                </button>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? 'Saving...' : 'Save Privacy Settings'}
        </Button>
      </div>
    </div>
  );
}
