'use client';

import { Sparkle, Vibrate } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { areHapticsEnabled, setHapticsEnabled } from '@/lib/utils/haptics-pref';
import { Icon } from '../../ui/Icon';
import { Switch } from '../../ui/Switch';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import type { ChDevice } from './model';
import { Card, Row } from './parts';

/**
 * Preferences saved on this device. Only the ones Clubhouse honours are
 * shown: animations (every Clubhouse transition) and haptics (the native
 * app). Theme and display formats wait for the dark theme (PROGRESS, gaps).
 */
export function PreferencesSection({ device }: { device: ChDevice }) {
  const { showAnimations, updatePreferences } = useAppearancePreferences();
  // Read after mount: the preference lives in this device's storage.
  const [haptics, setHaptics] = useState(true);
  useEffect(() => setHaptics(areHapticsEnabled()), []);
  return (
    <Card id="set-prefs" title="This device" description="Saved on this device only. Changes apply right away.">
      <Row label={<><Icon icon={Sparkle} size={15} /> Animations</>} help="Transitions when pages, panels and sheets open. Off makes every change instant.">
        <Switch
          label="Animations"
          hideLabel
          checked={showAnimations}
          onChange={(v) => {
            chTrail(`settings animations ${v ? 'on' : 'off'}`);
            updatePreferences({ showAnimations: v });
          }}
        />
      </Row>
      {device.native && (
        <Row label={<><Icon icon={Vibrate} size={15} /> Haptics</>} help="Taps you feel on buttons, switches and saves.">
          <Switch
            label="Haptics"
            hideLabel
            checked={haptics}
            onChange={(v) => {
              chTrail(`settings haptics ${v ? 'on' : 'off'}`);
              setHapticsEnabled(v);
              setHaptics(v);
              // A confirming tap when turning them on, so the change is felt.
              if (v) haptic('commit');
            }}
          />
        </Row>
      )}
    </Card>
  );
}
