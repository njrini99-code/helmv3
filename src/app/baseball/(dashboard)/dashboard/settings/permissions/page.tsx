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
// Reskinned onto "The Living Annual" kit (Lane 3 · THE PRESSBOX, team ink) —
// the sibling Roles page (settings/roles) already migrated the same header;
// this page had been missed. Same migration depth as Roles: `SectionMasthead`
// replaces the bespoke border-b header, and the off-palette amber "Sensitive"
// chip becomes an `<InkBadge>` stamp; the Card-based body stays as-is to match
// Roles/Program Settings' current level of migration.
// =============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getPermissionMatrix } from '@/app/baseball/actions/roles-permissions';
import { BaseballUnauthorizedError } from '@/lib/baseball/with-baseball-action';
import { redirectOnUnauthorized } from '@/lib/baseball/redirect-on-unauthorized';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { IconShield, IconLock, IconChevronRight, IconUsers } from '@/components/icons';
import { SectionMasthead, InkBadge } from '@/components/baseball/living-annual';

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
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Shared LA masthead — same component + eyebrow grammar as Settings,
          Roles, and Program Settings (ui-migration-map settings row). */}
      <SectionMasthead eyebrow="THE PRESSBOX · SETTINGS" title="Permissions" ink="team">
        <p className="max-w-prose font-annual text-body-sm text-text-secondary">
          What each capability group controls
        </p>
      </SectionMasthead>

      <div className="space-y-6">
        <div className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3 font-annual text-body-sm text-text-secondary">
          Capabilities are enforced on the server, not by hiding tabs. A capability
          a coach does not hold is blocked at the API even if a link is visible.
        </div>

        {data.groups.map((group) => (
          <Card key={group.key} variant="glass">
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="text-warm-600">
                  {group.sensitive ? <IconLock size={20} /> : <IconShield size={20} />}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-warm-900">{group.label}</h2>
                    {group.sensitive && <InkBadge label="Sensitive" tone="pursuit" variant="solid" />}
                  </div>
                  <p className="text-sm leading-relaxed text-warm-500">
                    {group.description}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {group.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-lg border border-[color:var(--hairline)] bg-[var(--paper-canvas)] px-3 py-1.5 font-mono text-sm capitalize text-text-secondary"
                  >
                    {capLabel(cap)}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {data.viewerCanInviteStaff && (
          <Link href="/baseball/dashboard/settings/staff">
            <Card variant="interactive" className="cursor-pointer transition-all hover:border-primary-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                      <IconUsers size={24} className="text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-warm-900 mb-1">Assign capabilities</h3>
                      <p className="text-sm leading-relaxed text-warm-500">
                        Grant these capabilities to staff on the Staff settings page.
                      </p>
                    </div>
                  </div>
                  <IconChevronRight size={20} className="text-warm-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
