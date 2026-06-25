// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/program/page.tsx
//
// Wave 4 / packet: settings-os
//
// Server entry for the Program Settings OS surface. Auth + active-team context +
// the program identity + settings document + viewer capabilities are resolved
// inside getProgramSettings (which runs through withBaseballAction). We render
// the variant-aware client editor with the resolved data; all writes re-validate
// can_manage_settings SERVER-SIDE.
//
// COACH route. A player has no coach profile / no manage-settings capability, so
// getProgramSettings returns viewerCanManageSettings:false (read-only) and the
// nav-registry hides the entry from players.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getProgramSettings } from '@/app/baseball/actions/program-settings';
import { ProgramSettingsClient } from '@/components/baseball/settings/ProgramSettingsClient';

export const metadata = {
  title: 'Program Settings | Helm Baseball',
  description: 'Configure program type, access policy, AI, imports, and integrations.',
};

export default async function ProgramSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/settings/program');
  }

  // Resolves active team + settings doc + viewer caps; enforces auth/context
  // server-side. Failures (no active team, no coach) bubble to error.tsx.
  const data = await getProgramSettings();

  return <ProgramSettingsClient data={data} />;
}
