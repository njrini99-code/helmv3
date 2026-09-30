'use client';

import type { ChDevice } from '../model';
import { useDevicePrefs } from '../hooks';
import { Group, SwitchRow } from './ui';

/** Preferences on the phone: what is kept on this device (animations and, in the app, haptics). */
export function PreferencesPhone({ device }: { device: ChDevice }) {
  const { animations, setAnimations, haptics, setHaptics } = useDevicePrefs();
  return (
    <Group title="This device" note="Saved on this device only. Changes apply right away.">
      <SwitchRow label="Animations" help="Transitions when pages, panels and sheets open. Off makes every change instant." checked={animations} onChange={setAnimations} />
      {device.native && <SwitchRow label="Haptics" help="Taps you feel on buttons, switches and saves." checked={haptics} onChange={setHaptics} />}
    </Group>
  );
}
