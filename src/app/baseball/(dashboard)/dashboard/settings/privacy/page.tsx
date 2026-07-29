import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PrivacySettingsForm } from '@/components/player/settings/PrivacySettingsForm';
import { SettingsShell } from '@/components/baseball/settings/SettingsChrome';

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

  // Privacy is one of only two settings screens a PLAYER can reach, so it is
  // where a player forms their impression of the product. It used to be the one
  // settings route with no masthead at all — a bespoke `bg-cream-100` full-bleed
  // wrapper, a `max-w-[720px]` measure nothing else in the tree uses, and a raw
  // `text-2xl text-warm-900` heading. It now wears the same `SettingsShell` as
  // every coach screen, so the two roles see one product.
  return (
    <SettingsShell
      title="Privacy Settings"
      lede="Control what information is visible on your public profile. These settings help you manage your recruiting presence while maintaining your privacy."
    >
      <PrivacySettingsForm
        playerId={player.id}
        initialSettings={transformedSettings}
      />
    </SettingsShell>
  );
}
