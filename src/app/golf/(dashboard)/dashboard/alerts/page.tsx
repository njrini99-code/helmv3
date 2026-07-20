import { permanentRedirect } from 'next/navigation';

/**
 * Coach alerts page — retired (2026-07-19, plan Task 9). The Alerts triage
 * workspace is now the `alerts` filter of the consolidated Signals drill on
 * the coach Intelligence home. Several action files (`alerts.ts`,
 * `insight-management.ts`, `intelligence-dashboard.ts`, `development.ts`,
 * `coaching-philosophy.ts`) still call `revalidatePath('/golf/dashboard/alerts')`,
 * so this route stays live as a permanent-redirect shim (never a 404) — same
 * pattern as `/my-insights` (surface-registry.ts: `legacy: true, hidden: true`).
 */
export default function AlertsPage(): never {
  permanentRedirect('/golf/dashboard/intelligence?view=signals&filter=alerts');
}
