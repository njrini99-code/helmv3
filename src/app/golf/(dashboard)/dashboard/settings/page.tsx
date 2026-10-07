'use client';

import { useSearchParams } from 'next/navigation';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwaySettingsGeneral } from '@/components/fairway/pages/settings';
// TEMP redesign switch (removed before ship): ?__redesign=a|b|c
import { SettingsDirectionA } from '@/components/fairway/pages/settings/redesign-settings/direction-a';
import { SettingsDirectionB } from '@/components/fairway/pages/settings/redesign-settings/direction-b';
import { SettingsDirectionC } from '@/components/fairway/pages/settings/redesign-settings/direction-c';

export default function GolfSettingsPage() {
  const variant = useSearchParams().get('__redesign');
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      {variant === 'a' ? (
        <SettingsDirectionA />
      ) : variant === 'b' ? (
        <SettingsDirectionB />
      ) : variant === 'c' ? (
        <SettingsDirectionC />
      ) : (
        <FairwaySettingsGeneral />
      )}
    </div>
  );
}
