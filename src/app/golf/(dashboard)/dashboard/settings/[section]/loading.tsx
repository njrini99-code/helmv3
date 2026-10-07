'use client';

/**
 * Route Suspense fallback for /golf/dashboard/settings/[section].
 *
 * A loading boundary receives no params, so this reads the section from the
 * URL and renders SettingsSectionSkeleton: the SAME component the section's
 * client shell renders while its profile loads, inside the SAME frame the
 * loaded page uses. The back link and the real title are there from the
 * first frame; only the cards below them, sized per section, are skeletons.
 */

import { useParams } from 'next/navigation';
import { fairwayScope } from '@/lib/redesign/flag';
import { getSettingsSection } from '@/components/fairway/pages/settings/redesign-settings/a/sections';
import { SettingsSectionSkeleton } from '@/components/fairway/pages/settings/redesign-settings/a/section-frame';

export default function SettingsSectionLoading() {
  const params = useParams<{ section?: string }>();
  const section = typeof params?.section === 'string' ? params.section : null;
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <SettingsSectionSkeleton config={getSettingsSection(section)} />
    </div>
  );
}
