import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PrivacySettingsForm } from '@/components/player/settings/PrivacySettingsForm';

export const metadata = {
  title: 'Privacy Settings | Helm',
  description: 'Manage your profile privacy settings',
};

export default async function PrivacySettingsPage() {
  const supabase = await createClient();

  // Single cached auth fetch — player profile already resolved
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  const player = session.player;
  if (!player) redirect('/baseball/dashboard/command-center');

  // Get existing privacy settings
  const { data: settings } = await supabase
    .from('baseball_player_settings')
    .select('*')
    .eq('player_id', player.id)
    .maybeSingle();

  // Map the real baseball_player_settings privacy columns to the form. Only
  // show_contact_info, show_academics, and show_dream_schools are editable
  // toggles; profile_visibility is managed elsewhere and left untouched.
  const transformedSettings = settings
    ? {
        show_contact_info: settings.show_contact_info ?? undefined,
        show_academics: settings.show_academics ?? undefined,
        show_dream_schools: settings.show_dream_schools ?? undefined,
      }
    : undefined;

  return (
    <div className="min-h-dvh bg-[#FAF6F1]">
      <div className="max-w-[720px] mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-warm-900 mb-2">
            Privacy Settings
          </h1>
          <p className="text-warm-600">
            Control what information is visible on your public profile. These settings help you manage your recruiting presence while maintaining your privacy.
          </p>
        </div>

        {/* Privacy Form */}
        <PrivacySettingsForm
          playerId={player.id}
          initialSettings={transformedSettings}
        />
      </div>
    </div>
  );
}
