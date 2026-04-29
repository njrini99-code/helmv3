import type { Metadata } from 'next';
import { SuppressionsAdminPanel } from '../../components/suppressions/SuppressionsAdminPanel';

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
    <main className="max-w-5xl mx-auto px-6 py-8">
      <SuppressionsAdminPanel />
    </main>
  );
}
