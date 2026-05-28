import { AutomationsList } from '../../components/automations/AutomationsList';

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
        <AutomationsList />
      </div>
    </div>
  );
}
