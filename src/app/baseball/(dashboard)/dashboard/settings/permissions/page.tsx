// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/permissions/page.tsx
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// Dedicated PERMISSIONS route (v4 §Role And Capability Settings). A standalone
// capability surface — separate from Staff — that makes every sensitive
// capability "visible in role settings": the capability GROUPS mapped to the
// server-enforced capability keys, with sensitive groups flagged. Capability
// ASSIGNMENT happens on the staff surface (linked). Auth + active-team + viewer
// caps resolve inside getPermissionMatrix (withBaseballAction). COACH route.
//
// The masthead and the "Sensitive" stamp had already migrated to the Living
// Annual kit, but every group panel below was still a legacy
// `Card variant="glass"` in `warm-*` ink and the staff link was a
// `Card variant="interactive"` in `primary-*` — two more card stocks on a page
// that already had one. All three now compose from `SettingsChrome`, the same
// recipe the hub, Roles, and Program Settings render.
//
// PRESENTATION-ONLY: the data read, the `viewerCanInviteStaff` gate, the
// capability label derivation, and the staff href are untouched.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getPermissionMatrix } from '@/app/baseball/actions/roles-permissions';
import { BaseballUnauthorizedError } from '@/lib/baseball/with-baseball-action';
import { redirectOnUnauthorized } from '@/lib/baseball/redirect-on-unauthorized';
import { IconShield, IconLock, IconUsers } from '@/components/icons';
import { InkBadge } from '@/components/baseball/living-annual';
import {
  SettingsNavCard,
  SettingsNotice,
  SettingsSection,
  SettingsShell,
} from '@/components/baseball/settings/SettingsChrome';

export const metadata = {
  title: 'Permissions | Helm Baseball',
  description: 'What each capability group controls. Every sensitive capability is visible here.',
};

function capLabel(cap: string): string {
  return cap
    .replace(/^can_/, '')
    .replace(/^is_/, '')
    .split('_')
    .join(' ');
}

export default async function PermissionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/baseball/login?returnTo=/baseball/dashboard/settings/permissions');
  }

  // getPermissionMatrix independently re-resolves auth (withBaseballAction).
  // A session that expires in the narrow window between the check above and
  // this call throws BaseballUnauthorizedError, which must redirect to login
  // rather than raw-throw to error.tsx/Sentry. Any OTHER failure keeps
  // propagating.
  const data = await redirectOnUnauthorized(
    () => getPermissionMatrix(),
    (error) => error instanceof BaseballUnauthorizedError,
    '/baseball/dashboard/settings/permissions',
  );

  return (
    <SettingsShell title="Permissions" lede="What each capability group controls">
      <SettingsNotice>
        Capabilities are enforced on the server, not by hiding tabs. A capability
        a coach does not hold is blocked at the API even if a link is visible.
      </SettingsNotice>

      {data.groups.map((group, i) => (
        <SettingsSection
          key={group.key}
          index={i}
          icon={group.sensitive ? <IconLock size={18} /> : <IconShield size={18} />}
          title={group.label}
          subtitle={group.description}
          badge={
            group.sensitive ? (
              <InkBadge label="Sensitive" tone="pursuit" variant="solid" />
            ) : undefined
          }
          bodySpacing="none"
        >
          <div className="flex flex-wrap gap-2">
            {group.capabilities.map((cap) => (
              <span
                key={cap}
                className="rounded-fw-sm border border-[color:var(--hairline)] bg-[var(--paper-canvas)] px-3 py-1.5 font-mono text-sm capitalize text-text-secondary"
              >
                {capLabel(cap)}
              </span>
            ))}
          </div>
        </SettingsSection>
      ))}

      {data.viewerCanInviteStaff && (
        <SettingsNavCard
          href="/baseball/dashboard/settings/staff"
          label="Assign capabilities"
          description="Grant these capabilities to staff on the Staff settings page."
          icon={<IconUsers size={20} />}
        />
      )}
    </SettingsShell>
  );
}
