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
  if (!player) redirect('/baseball/dashboard');

  // Get existing privacy settings
  const { data: settings } = await supabase
    .from('baseball_player_settings')
    .select('*')
    .eq('player_id', player.id)
    .maybeSingle();

  // Transform database settings to component format
  // Map database fields to component expected fields (use defaults for missing fields)
  // Database columns: show_contact_info, show_academics, show_dream_schools, profile_visibility
  const transformedSettings = settings ? {
    id: settings.id,
    player_id: settings.player_id,
    // Map database fields that exist
    show_contact_email: settings.show_contact_info ?? undefined,
    show_academics: settings.show_academics ?? undefined,
    show_dream_schools: settings.show_dream_schools ?? undefined,
    profile_visibility: settings.profile_visibility ?? undefined,
    // Default values for fields not in database
    show_full_name: true,
    show_school: true,
    show_phone: settings.show_contact_info ?? undefined,
    show_social_links: true,
    show_height_weight: true,
    show_position: true,
    show_grad_year: true,
    show_bats_throws: true,
    show_videos: true,
    show_calendar: true,
    show_stats: true,
    allow_messages: true,
  } : undefined;

  return (
    <div className="min-h-dvh bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-8">
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
