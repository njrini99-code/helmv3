// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/demo-mode/page.tsx
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// The Demo Mode section was removed from the consolidated Program Settings page
// (PKT-12) and has no controls yet, so there is no `#demo-mode` anchor to
// deep-link to. Program Settings itself no longer has a Demo Mode section at
// all, so redirecting there is a dead end dressed up as a destination. This
// spec route stays reachable (v4 §Settings Architecture) by redirecting to
// the Settings hub root instead, where every real settings page is listed.
// =============================================================================

import { permanentRedirect } from 'next/navigation';
import { BASEBALL_SETTINGS_HUB_PATH } from '@/lib/baseball/settings-route-aliases';

export const metadata = {
  title: 'Demo Mode Settings | Helm Baseball',
};

export default function Page() {
  permanentRedirect(BASEBALL_SETTINGS_HUB_PATH);
}
