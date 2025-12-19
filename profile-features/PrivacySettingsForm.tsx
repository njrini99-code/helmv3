// components/player/settings/PrivacySettingsForm.tsx
'use client';

import { useState, useTransition } from 'react';
import {
  IconUser as User,
  IconVideo as Video,
  IconCalendar as Calendar,
  IconGraduationCap as GraduationCap,
  IconChart as BarChart3,
  IconShield as Lock,
  IconEye as Eye,
  IconStar as Star,
  IconMapPin as MapPin,
  IconPhone as Phone,
  IconExternalLink as Globe
} from '@/components/icons';
import { Toggle, SettingsSection } from './Toggle';
import { updatePlayerPrivacySettings } from '@/app/actions/profile-settings';
import type { PlayerPrivacySettings } from '@/types/profile';

interface PrivacySettingsFormProps {
  playerId: string;
  initialSettings: PlayerPrivacySettings | null;
  recruitingActivated: boolean;
}

export function PrivacySettingsForm({ 
  playerId, 
  initialSettings, 
  recruitingActivated 
}: PrivacySettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<PlayerPrivacySettings>(
    initialSettings || getDefaultSettings()
  );
  const [saved, setSaved] = useState(false);

  function getDefaultSettings(): PlayerPrivacySettings {
    return {
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
      notify_on_interest: true,
    };
  }

  const updateSetting = (key: keyof PlayerPrivacySettings) => (value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await updatePlayerPrivacySettings(playerId, settings);
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Recruiting Mode Banner */}
      <div className={`rounded-2xl p-6 ${
        recruitingActivated 
          ? 'bg-gradient-to-r from-green-600 to-green-500 text-white' 
          : 'bg-slate-100 text-slate-600'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {recruitingActivated ? 'Recruiting Mode Active' : 'Recruiting Mode Off'}
            </h2>
            <p className={recruitingActivated ? 'text-green-100' : 'text-slate-500'}>
              {recruitingActivated 
                ? 'Your profile is visible to college coaches'
                : 'Activate recruiting to get discovered by coaches'}
            </p>
          </div>
          {recruitingActivated && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-sm text-green-100">Live</span>
            </div>
          )}
        </div>
      </div>

      {/* Basic Information */}
      <SettingsSection title="Basic Information" icon={<User className="w-5 h-5" />}>
        <Toggle
          enabled={settings.show_full_name ?? true}
          onChange={updateSetting('show_full_name')}
          label="Full Name"
          description="Show your full name on your profile"
        />
        <Toggle
          enabled={settings.show_location ?? true}
          onChange={updateSetting('show_location')}
          label="Location"
          description="City and state"
        />
        <Toggle
          enabled={settings.show_school ?? true}
          onChange={updateSetting('show_school')}
          label="School"
          description="High school and club team"
        />
        <Toggle
          enabled={settings.show_contact_email ?? false}
          onChange={updateSetting('show_contact_email')}
          label="Contact Email"
          description="Let coaches see your email directly"
        />
        <Toggle
          enabled={settings.show_phone ?? false}
          onChange={updateSetting('show_phone')}
          label="Phone Number"
          description="Let coaches see your phone number"
        />
        <Toggle
          enabled={settings.show_social_links ?? true}
          onChange={updateSetting('show_social_links')}
          label="Social Media"
          description="Twitter, Instagram links"
        />
      </SettingsSection>

      {/* Physical & Baseball Info */}
      <SettingsSection title="Physical & Baseball Info" icon={<BarChart3 className="w-5 h-5" />}>
        <Toggle
          enabled={settings.show_height_weight ?? true}
          onChange={updateSetting('show_height_weight')}
          label="Height & Weight"
        />
        <Toggle
          enabled={settings.show_position ?? true}
          onChange={updateSetting('show_position')}
          label="Position(s)"
        />
        <Toggle
          enabled={settings.show_grad_year ?? true}
          onChange={updateSetting('show_grad_year')}
          label="Graduation Year"
        />
        <Toggle
          enabled={settings.show_bats_throws ?? true}
          onChange={updateSetting('show_bats_throws')}
          label="Bats/Throws"
        />
      </SettingsSection>

      {/* Recruiting Features (only if recruiting activated) */}
      <SettingsSection title="Recruiting Features" icon={<Star className="w-5 h-5" />}>
        <Toggle
          enabled={settings.show_in_discover ?? true}
          onChange={updateSetting('show_in_discover')}
          label="Appear in Discover"
          description="Let coaches find you when searching for players"
          disabled={!recruitingActivated}
        />
        <Toggle
          enabled={settings.show_videos ?? true}
          onChange={updateSetting('show_videos')}
          label="Videos"
          description="Show your highlight and training videos"
          disabled={!recruitingActivated}
        />
        <Toggle
          enabled={settings.show_dream_schools ?? true}
          onChange={updateSetting('show_dream_schools')}
          label="Dream Schools"
          description="Show your top 10 dream schools list"
          disabled={!recruitingActivated}
        />
        <Toggle
          enabled={settings.show_calendar ?? false}
          onChange={updateSetting('show_calendar')}
          label="Public Calendar"
          description="Let coaches see your upcoming events and showcases"
          disabled={!recruitingActivated}
        />
        <Toggle
          enabled={settings.show_stats ?? true}
          onChange={updateSetting('show_stats')}
          label="Verified Stats"
          description="Display your baseball statistics"
          disabled={!recruitingActivated}
        />
        {!recruitingActivated && (
          <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg mt-2">
            Activate recruiting mode to enable these features
          </p>
        )}
      </SettingsSection>

      {/* Academics */}
      <SettingsSection title="Academics" icon={<GraduationCap className="w-5 h-5" />}>
        <Toggle
          enabled={settings.show_gpa ?? true}
          onChange={updateSetting('show_gpa')}
          label="GPA"
          description="Show your grade point average"
        />
        <Toggle
          enabled={settings.show_test_scores ?? true}
          onChange={updateSetting('show_test_scores')}
          label="Test Scores"
          description="SAT / ACT scores"
        />
      </SettingsSection>

      {/* Privacy & Communication */}
      <SettingsSection title="Privacy & Communication" icon={<Lock className="w-5 h-5" />}>
        <Toggle
          enabled={settings.allow_messages ?? true}
          onChange={updateSetting('allow_messages')}
          label="Allow Messages"
          description="Let coaches message you directly through the platform"
        />
        <Toggle
          enabled={settings.notify_on_interest ?? true}
          onChange={updateSetting('notify_on_interest')}
          label="Interest Notifications"
          description="Get notified when coaches view your profile or add you to watchlist"
        />
      </SettingsSection>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-4">
        {saved && (
          <p className="text-green-600 text-sm font-medium">✓ Settings saved</p>
        )}
        <button
          onClick={handleSave}
          disabled={isPending}
          className={`ml-auto px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors
            ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
