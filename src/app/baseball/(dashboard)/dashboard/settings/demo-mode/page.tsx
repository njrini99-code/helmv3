// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/demo-mode/page.tsx
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// The Demo Mode section was removed from the consolidated Program Settings page
// (PKT-12) and has no controls yet, so there is no `#demo-mode` anchor to
// deep-link to. This spec route stays reachable (v4 §Settings Architecture) by
// redirecting to the Program Settings page itself rather than a dead anchor.
// =============================================================================

import { permanentRedirect } from 'next/navigation';
import { BASEBALL_PROGRAM_SETTINGS_PATH } from '@/lib/baseball/settings-route-aliases';

export const metadata = {
  title: 'Demo Mode Settings | Helm Baseball',
};

export default function Page() {
  permanentRedirect(BASEBALL_PROGRAM_SETTINGS_PATH);
}
