'use client';

import { fairwayScope } from '@/lib/redesign/flag';
import { FairwaySettingsGeneral } from '@/components/fairway/pages/settings';

export default function GolfSettingsPage() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwaySettingsGeneral />
    </div>
  );
}
