'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/components/ui/sonner';

/**
 * Only the privacy toggles that map to real columns on
 * `baseball_player_settings` (profile_visibility, show_academics,
 * show_contact_info, show_dream_schools). The form previously rendered ~18
 * toggles — none of which existed as columns — so every save failed on an
 * "unknown column" error. Toggles without a backing column were removed rather
 * than left as controls that silently do nothing.
 */
export interface PlayerPrivacySettings {
  show_contact_info: boolean;
  show_academics: boolean;
  show_dream_schools: boolean;
}

interface PrivacySettingsFormProps {
  playerId: string;
  initialSettings?: Partial<PlayerPrivacySettings>;
  onSave?: (settings: PlayerPrivacySettings) => void;
}

const SETTING_ITEMS: {
  key: keyof PlayerPrivacySettings;
  label: string;
  description: string;
}[] = [
  {
    key: 'show_contact_info',
    label: 'Show Contact Info',
    description: 'Display your email and phone on your public profile so coaches can reach you directly',
  },
  {
    key: 'show_academics',
    label: 'Show Academics',
    description: 'Display your GPA and test scores',
  },
  {
    key: 'show_dream_schools',
    label: 'Show Dream Schools',
    description: 'Display your list of top college choices',
  },
];

// Defaults for a player who has never saved settings. Kept consistent with the
// read side (public profile treats show_dream_schools !== false as visible);
// contact info defaults to hidden since it's the most sensitive.
const DEFAULT_SETTINGS: PlayerPrivacySettings = {
  show_contact_info: false,
  show_academics: true,
  show_dream_schools: true,
};

export function PrivacySettingsForm({
  playerId,
  initialSettings,
  onSave,
}: PrivacySettingsFormProps) {
  const [settings, setSettings] = useState<PlayerPrivacySettings>({
    show_contact_info: initialSettings?.show_contact_info ?? DEFAULT_SETTINGS.show_contact_info,
    show_academics: initialSettings?.show_academics ?? DEFAULT_SETTINGS.show_academics,
    show_dream_schools: initialSettings?.show_dream_schools ?? DEFAULT_SETTINGS.show_dream_schools,
  });

  const [saving, setSaving] = useState(false);

  const handleToggle = (key: keyof PlayerPrivacySettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    // Write ONLY the real privacy columns. Using the typed client (not
    // fromUntyped) means an unknown column would now be a compile error.
    // profile_visibility is deliberately left untouched — it gates public
    // access and is managed elsewhere.
    const payload = {
      show_contact_info: settings.show_contact_info,
      show_academics: settings.show_academics,
      show_dream_schools: settings.show_dream_schools,
    };

    try {
      const { data: existing } = await supabase
        .from('baseball_player_settings')
        .select('id')
        .eq('player_id', playerId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('baseball_player_settings')
          .update(payload)
          .eq('player_id', playerId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('baseball_player_settings')
          .insert({ ...payload, player_id: playerId });
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
      <Card className="overflow-hidden">
        <div className="relative p-6 border-b border-warm-200">
          <h3 className="text-lg font-semibold text-warm-900 mb-1">Profile Visibility</h3>
          <p className="text-sm leading-relaxed text-warm-500">
            Control what information appears on your public profile
          </p>
        </div>

        <div className="relative p-6 space-y-4 bg-warm-50/50">
          {SETTING_ITEMS.map((setting) => (
            <div
              key={setting.key}
              className="relative flex items-start justify-between gap-4 p-4 glass-subtle rounded-lg overflow-clip"
            >
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                }}
              />
              <div className="relative flex-1">
                <label
                  htmlFor={setting.key}
                  className="text-sm font-medium text-warm-900 block mb-1 cursor-pointer"
                >
                  {setting.label}
                </label>
                <p className="text-xs text-warm-500">{setting.description}</p>
              </div>

              {/* Toggle Switch — a plain native <button>, not IconButton: the
                  visible track has to stay the standard 24px-tall (h-6)
                  iOS-style switch shape, but that's under the 44px tap-target
                  floor. IconButton's `overflow-hidden` (baked into its
                  baseStyles) would clip an invisible `before:` hit-slop
                  pseudo-element the moment it extends past the button's own
                  box, so it can't reach 44px without that clip eating the
                  extra reach (mirrors MinimumStandards.tsx / PhilosophySettingsClient.tsx).
                  A plain button carries none of that baggage. */}
              {/* eslint-disable-next-line helm/no-raw-button -- compact h-6 toggle track; IconButton's overflow-hidden clips the hit-slop pseudo-element below (mirrors MinimumStandards.tsx) */}
              <button
                type="button"
                role="switch"
                aria-label={setting.label}
                id={setting.key}
                aria-checked={settings[setting.key] === true}
                onClick={() => handleToggle(setting.key)}
                className={`
                    relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                    transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2
                    before:absolute before:-inset-2.5 before:content-['']
                    ${settings[setting.key] ? 'bg-primary-600' : 'bg-warm-300'}
                  `}
              >
                <span
                  className={`
                      pointer-events-none inline-block h-5 w-5 transform rounded-full bg-cream-50 shadow ring-0
                      transition duration-200 ease-in-out
                      ${settings[setting.key] ? 'translate-x-5' : 'translate-x-0'}
                    `}
                />
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? 'Saving...' : 'Save Privacy Settings'}
        </Button>
      </div>
    </div>
  );
}
