// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/roles/page.tsx
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// Dedicated ROLES route (v4 §Role And Capability Settings). A per-mode role-
// template reference: the role templates that make sense for the active team's
// program_type, read from the variant engine. Capability ASSIGNMENT happens on
// the staff surface (linked below) — this page makes the role taxonomy visible.
// Auth + active-team + viewer caps resolve inside getRoleTemplates
// (withBaseballAction). COACH route.
//
// The masthead had already migrated to the Living Annual kit, but the body was
// still legacy `Card variant="glass" | "interactive"` painted in `warm-*` /
// `cream-*` / `primary-*` — so the top half and the bottom half of one page were
// two different design systems. Both halves now compose from `SettingsChrome`,
// the same recipe the hub and Program Settings render.
//
// PRESENTATION-ONLY: the data read, the `viewerCanInviteStaff` gate, and both
// destination hrefs are untouched.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getRoleTemplates } from '@/app/baseball/actions/roles-permissions';
import { BaseballUnauthorizedError } from '@/lib/baseball/with-baseball-action';
import { redirectOnUnauthorized } from '@/lib/baseball/redirect-on-unauthorized';
import { IconUsers, IconShield } from '@/components/icons';
import {
  SettingsNavCard,
  SettingsSection,
  SettingsShell,
} from '@/components/baseball/settings/SettingsChrome';

export const metadata = {
  title: 'Roles | Helm Baseball',
  description: 'Role templates for your program mode and where to assign them.',
};

function titleize(s: string): string {
  return s
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default async function RolesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/settings/roles');
  }

  // getRoleTemplates independently re-resolves auth (withBaseballAction). A
  // session that expires in the narrow window between the check above and
  // this call throws BaseballUnauthorizedError, which must redirect to login
  // rather than raw-throw to error.tsx/Sentry. Any OTHER failure keeps
  // propagating.
  const data = await redirectOnUnauthorized(
    () => getRoleTemplates(),
    (error) => error instanceof BaseballUnauthorizedError,
    '/baseball/dashboard/settings/roles',
  );

  return (
    <SettingsShell
      title="Roles"
      lede={`Role templates for ${data.programLabel} programs`}
    >
      <SettingsSection
        icon={<IconUsers size={18} />}
        title="Role templates"
        subtitle={`These roles fit a ${data.programLabel.toLowerCase()} program. Roles are templates — actual access is governed by capabilities, which are enforced on the server.`}
        bodySpacing="none"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.roleTemplates.map((role) => (
            <div
              key={role}
              className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] px-4 py-3"
            >
              <span className="font-annual text-body font-medium text-text-primary">
                {titleize(role)}
              </span>
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* Capabilities reference */}
      <SettingsNavCard
        href="/baseball/dashboard/settings/permissions"
        label="Capabilities"
        description="See exactly what each capability group controls."
        icon={<IconShield size={20} />}
      />

      {/* Assignment lives on the staff surface */}
      {data.viewerCanInviteStaff && (
        <SettingsNavCard
          href="/baseball/dashboard/settings/staff"
          label="Assign staff roles"
          description="Invite staff and grant capabilities on the Staff settings page."
          icon={<IconUsers size={20} />}
        />
      )}
    </SettingsShell>
  );
}
