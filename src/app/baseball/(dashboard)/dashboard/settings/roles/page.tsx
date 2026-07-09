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
// =============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getRoleTemplates } from '@/app/baseball/actions/roles-permissions';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { IconUsers, IconChevronRight, IconShield } from '@/components/icons';
import { SectionMasthead } from '@/components/baseball/living-annual';

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

  const data = await getRoleTemplates();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Shared LA masthead — same component + eyebrow grammar as Settings and
          Program Settings (ui-migration-map settings row). */}
      <SectionMasthead eyebrow="THE PRESSBOX · SETTINGS" title="Roles" ink="team">
        <p className="font-annual text-body-sm text-text-secondary">
          {`Role templates for ${data.programLabel} programs`}
        </p>
      </SectionMasthead>

      <div className="space-y-6">
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="text-warm-600">
                <IconUsers size={20} />
              </span>
              <div>
                <h2 className="font-semibold text-warm-900">Role templates</h2>
                <p className="text-sm leading-relaxed text-warm-500">
                  These roles fit a {data.programLabel.toLowerCase()} program. Roles
                  are templates — actual access is governed by capabilities, which
                  are enforced on the server.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.roleTemplates.map((role) => (
                <div
                  key={role}
                  className="rounded-xl border border-warm-200 bg-cream-50 px-4 py-3"
                >
                  <span className="font-medium text-warm-900">{titleize(role)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Capabilities reference */}
        <Link href="/baseball/dashboard/settings/permissions">
          <Card variant="interactive" className="cursor-pointer transition-all hover:border-primary-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                    <IconShield size={24} className="text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-warm-900 mb-1">Capabilities</h3>
                    <p className="text-sm leading-relaxed text-warm-500">
                      See exactly what each capability group controls.
                    </p>
                  </div>
                </div>
                <IconChevronRight size={20} className="text-warm-400" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Assignment lives on the staff surface */}
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
                      <h3 className="font-semibold text-warm-900 mb-1">Assign staff roles</h3>
                      <p className="text-sm leading-relaxed text-warm-500">
                        Invite staff and grant capabilities on the Staff settings page.
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
