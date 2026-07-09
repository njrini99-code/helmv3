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
// =============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getPermissionMatrix } from '@/app/baseball/actions/roles-permissions';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { IconShield, IconLock, IconChevronRight, IconUsers } from '@/components/icons';

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

  const data = await getPermissionMatrix();

  return (
    <>
      <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-semibold text-warm-900">Permissions</h1>
          <p className="mt-1 text-body-sm text-warm-500">What each capability group controls</p>
        </div>
      </div>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-600">
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
                    {group.sensitive && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Sensitive
                      </span>
                    )}
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
                    className="rounded-lg border border-warm-200 bg-cream-50 px-3 py-1.5 text-sm font-mono text-warm-700 capitalize"
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
    </>
  );
}
