// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/imports/page.tsx
//
// Wave 4 / packet: settings-os
//
// Server entry for the Import Source Settings surface (v4 §Import Source
// Settings, route line 18). Renders the registry of import sources for the
// active team: trust level, required-review, dedupe strictness, player-matching
// strategy and external-id namespace.
//
// Reads run through getProgramSettings (viewer caps) + listImportSources, both
// wrapped in withBaseballAction so capability is enforced SERVER-SIDE. A viewer
// without can_manage_imports has listImportSources throw, which the route
// error.tsx turns into a safe access-required state. revalidateSettings() in the
// CRUD actions now targets a page that actually renders.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import {
  getProgramSettings,
  listImportSources,
} from '@/app/baseball/actions/program-settings';
import { BaseballUnauthorizedError } from '@/lib/baseball/with-baseball-action';
import { redirectOnUnauthorized } from '@/lib/baseball/redirect-on-unauthorized';
import { ImportSourcesClient } from '@/components/baseball/settings/ImportSourcesClient';

export const metadata = {
  title: 'Import Sources | Helm Baseball',
  description:
    'Register import sources with trust levels, review rules, and player matching.',
};

export default async function ImportSourcesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/settings/imports');
  }

  // Viewer caps drive edit affordances; the list is staff-only (the action
  // re-checks can_manage_imports server-side regardless of what the UI shows).
  // Both getters independently re-resolve auth (withBaseballAction). A
  // session that expires in the narrow window between the check above and
  // these calls throws BaseballUnauthorizedError, which must redirect to
  // login rather than raw-throw to error.tsx/Sentry. Any OTHER failure keeps
  // propagating.
  const { settings, sources } = await redirectOnUnauthorized(
    async () => {
      const settings = await getProgramSettings();
      const sources = await listImportSources();
      return { settings, sources };
    },
    (error) => error instanceof BaseballUnauthorizedError,
    '/baseball/dashboard/settings/imports',
  );

  return (
    <ImportSourcesClient
      teamName={settings.teamName}
      canManage={settings.viewerCanManageImports}
      sources={sources}
    />
  );
}
