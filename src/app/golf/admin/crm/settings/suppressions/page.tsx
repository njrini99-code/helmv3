import type { Metadata } from 'next';
import { SuppressionsAdminPanel } from '../../components/suppressions/SuppressionsAdminPanel';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { SecondaryNav } from '@/components/ui/secondary-nav';

const CRM_SETTINGS_TABS = [
  { label: 'Automations', href: '/golf/admin/crm/settings/automations' },
  { label: 'Suppressions', href: '/golf/admin/crm/settings/suppressions' },
];

// ============================================================================
// /golf/admin/crm/settings/suppressions
// ----------------------------------------------------------------------------
// Admin route is gated by the parent CRM layout (src/app/golf/admin/crm/
// layout.tsx) which redirects non-admins to /golf/login. This page just
// renders the standalone client panel.
// ============================================================================

export const metadata: Metadata = {
  title: 'Email suppressions · CRM',
};

export default function SuppressionsPage() {
  return (
    <main className="max-w-[720px] mx-auto px-6 py-8">
      <Breadcrumb
        className="mb-6"
        items={[
          { label: 'CRM', href: '/golf/admin/crm' },
          { label: 'Settings' },
          { label: 'Suppressions' },
        ]}
      />
      <SecondaryNav
        className="mb-6"
        items={CRM_SETTINGS_TABS}
        currentRoute="/golf/admin/crm/settings/suppressions"
      />
      <SuppressionsAdminPanel />
    </main>
  );
}
