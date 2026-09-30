'use client';

import { Sparkle, Vibrate } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import type { ChDevice } from './model';
import { useDevicePrefs } from './hooks';
import { Card, Row, SettingSwitch } from './parts';

/**
 * Preferences saved on this device. Only the ones Clubhouse honours are
 * shown: animations (every Clubhouse transition) and haptics (the native
 * app). Theme and display formats wait for the dark theme (PROGRESS, gaps).
 */
export function PreferencesSection({ device }: { device: ChDevice }) {
  const { animations, setAnimations, haptics, setHaptics } = useDevicePrefs();
  return (
    <Card id="set-prefs" title="This device" description="Saved on this device only. Changes apply right away.">
      <Row label={<><Icon icon={Sparkle} size={15} /> Animations</>} help="Transitions when pages, panels and sheets open. Off makes every change instant.">
        <SettingSwitch label="Animations" hideLabel checked={animations} onChange={setAnimations} />
      </Row>
      {device.native && (
        <Row label={<><Icon icon={Vibrate} size={15} /> Haptics</>} help="Taps you feel on buttons, switches and saves.">
          <SettingSwitch label="Haptics" hideLabel checked={haptics} onChange={setHaptics} />
        </Row>
      )}
    </Card>
  );
}
