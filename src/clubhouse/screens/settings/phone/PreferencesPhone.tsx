'use client';

import { DISTANCE_OPTIONS, type ChDevice } from '../model';
import { useDevicePrefs } from '../hooks';
import { Group, PickerRow, SwitchRow } from './ui';

/** Preferences on the phone: what is kept on this device (animations, the distance unit and, in the app, haptics). */
export function PreferencesPhone({ device }: { device: ChDevice }) {
  const { animations, setAnimations, distance, setDistance, haptics, setHaptics } = useDevicePrefs();
  return (
    <Group title="This device" note="Saved on this device only. Changes apply right away.">
      <SwitchRow label="Animations" help="Transitions when pages, panels and sheets open. Off makes every change instant." checked={animations} onChange={setAnimations} />
      <PickerRow label="Distance units" value={distance} options={DISTANCE_OPTIONS} onPick={setDistance} />
      {device.native && <SwitchRow label="Haptics" help="Taps you feel on buttons, switches and saves." checked={haptics} onChange={setHaptics} />}
    </Group>
  );
}
