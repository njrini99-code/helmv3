// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/demo-mode/page.tsx
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// Demo Mode Settings is an ACCEPTED consolidation: its controls live as a section of the
// single Program Settings page (one save surface, one capability gate). This
// dedicated spec route (v4 §Settings Architecture) resolves by redirecting to
// that section's anchor, so every route in the spec route map is reachable and
// deep-linkable without duplicating the editor or its server enforcement.
// =============================================================================

import { permanentRedirect } from 'next/navigation';
import { getBaseballSettingsAliasHref } from '@/lib/baseball/settings-route-aliases';

export const metadata = {
  title: 'Demo Mode Settings | Helm Baseball',
};

export default function Page() {
  permanentRedirect(getBaseballSettingsAliasHref('demo-mode'));
}
