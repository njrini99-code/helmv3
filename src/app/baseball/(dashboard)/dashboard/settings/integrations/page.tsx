// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/integrations/page.tsx
//
// Wave 4 / packet: settings-os
//
// Server entry for the Integrations surface (v4 §Integrations Philosophy, route
// line 19). Lists per-team integration adapter CONTRACTS (levels 1-4). NO direct
// vendor calls and NO credentials — level 4 (direct API) rows are inert and stay
// pending_pilot until pilot evidence + explicit permission.
//
// Reads run through getProgramSettings (viewer caps) + listIntegrations, both
// wrapped in withBaseballAction so capability is enforced SERVER-SIDE. Writes
// re-validate can_manage_settings. revalidateSettings() now targets a page that
// actually renders.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import {
  getProgramSettings,
  listIntegrations,
} from '@/app/baseball/actions/program-settings';
import { IntegrationsClient } from '@/components/baseball/settings/IntegrationsClient';

export const metadata = {
  title: 'Integrations | Helm Baseball',
  description:
    'Connection levels for stat and device sources. Adapter contracts only — no credentials stored.',
};

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/settings/integrations');
  }

  const settings = await getProgramSettings();
  const integrations = await listIntegrations();

  return (
    <IntegrationsClient
      teamName={settings.teamName}
      canManage={settings.viewerCanManageSettings}
      integrations={integrations}
    />
  );
}
