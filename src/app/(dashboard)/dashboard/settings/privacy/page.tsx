import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PrivacySettingsForm } from '@/components/player/settings/PrivacySettingsForm';

export const metadata = {
  title: 'Privacy Settings | Helm',
  description: 'Manage your profile privacy settings',
};

export default async function PrivacySettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Get player record
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    redirect('/dashboard');
  }

  // Get existing privacy settings
  const { data: settings } = await supabase
    .from('player_settings')
    .select('*')
    .eq('player_id', player.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">
            Privacy Settings
          </h1>
          <p className="text-slate-600">
            Control what information is visible on your public profile. These settings help you manage your recruiting presence while maintaining your privacy.
          </p>
        </div>

        {/* Privacy Form */}
        <PrivacySettingsForm
          playerId={player.id}
          initialSettings={settings as any || undefined}
        />
      </div>
    </div>
  );
}
