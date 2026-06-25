// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/audit/page.tsx
//
// Wave 4 / packet: settings-os
//
// Server entry for the Settings Audit Log surface (v4 §Data Retention And Audit).
// Append-only history of sensitive setting changes (program type, roles/caps,
// visibility, public profile, guardian/scout access, AI settings, imports/
// integrations, data export).
//
// Read runs through getSettingsAuditLog, wrapped in withBaseballAction with
// requiredCapability: can_manage_settings — enforced SERVER-SIDE. A viewer
// without that capability has the action throw, which the route error.tsx turns
// into a safe access-required state. This surface makes the audit trail (written
// by every settings mutation) actually reachable.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import {
  getProgramSettings,
  getSettingsAuditLog,
} from '@/app/baseball/actions/program-settings';
import { SettingsAuditClient } from '@/components/baseball/settings/SettingsAuditClient';

export const metadata = {
  title: 'Settings Audit Log | Helm Baseball',
  description: 'Append-only history of sensitive setting changes.',
};

export default async function SettingsAuditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/settings/audit');
  }

  const settings = await getProgramSettings();
  const entries = await getSettingsAuditLog(100);

  return <SettingsAuditClient teamName={settings.teamName} entries={entries} />;
}
