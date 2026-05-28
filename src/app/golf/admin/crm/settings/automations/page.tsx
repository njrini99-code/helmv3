import { AutomationsList } from '../../components/automations/AutomationsList';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { SecondaryNav } from '@/components/ui/secondary-nav';

const CRM_SETTINGS_TABS = [
  { label: 'Automations', href: '/golf/admin/crm/settings/automations' },
  { label: 'Suppressions', href: '/golf/admin/crm/settings/suppressions' },
];

// ============================================================================
// /golf/admin/crm/settings/automations
//
// Admin settings page for configurable automation rules. The auth gate is
// handled by src/app/golf/admin/crm/layout.tsx (admin role required).
// ============================================================================

export const metadata = {
  title: 'CRM Automations · Helm Sports Labs',
};

export default function CRMAutomationsSettingsPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <div className="mx-auto max-w-[720px] px-4 sm:px-6 py-8">
        <Breadcrumb
          className="mb-6"
          items={[
            { label: 'CRM', href: '/golf/admin/crm' },
            { label: 'Settings' },
            { label: 'Automations' },
          ]}
        />
        <SecondaryNav
          className="mb-6"
          items={CRM_SETTINGS_TABS}
          currentRoute="/golf/admin/crm/settings/automations"
        />
        <AutomationsList />
      </div>
    </div>
  );
}
