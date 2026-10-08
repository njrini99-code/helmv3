'use client';

import { Ruler, SunMoon, Sparkle, Vibrate } from 'lucide-react';
import { useGolfTheme } from '@/lib/golf/theme';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { DISTANCE_OPTIONS, THEME_OPTIONS, type ChDevice } from './model';
import { useDevicePrefs } from './hooks';
import { Card, Row, SettingSwitch } from './parts';

/**
 * Preferences saved on this device. Only the ones Clubhouse honours are
 * shown: appearance (light, dark or the system's), animations (every Clubhouse
 * transition), the distance unit (the shot screen) and haptics (the native app).
 */
export function PreferencesSection({ device }: { device: ChDevice }) {
  const { animations, setAnimations, distance, setDistance, haptics, setHaptics } = useDevicePrefs();
  const { theme, setTheme } = useGolfTheme();
  return (
    <Card id="set-prefs" title="This device" description="Saved on this device only. Changes apply right away.">
      <Row label={<><Icon icon={SunMoon} size={15} /> Appearance</>} help="System follows this device’s light or dark setting.">
        <Segmented label="Appearance" size="sm" value={theme} options={THEME_OPTIONS} onChange={setTheme} />
      </Row>
      <Row label={<><Icon icon={Sparkle} size={15} /> Animations</>} help="Transitions when pages, panels and sheets open. Off makes every change instant.">
        <SettingSwitch label="Animations" hideLabel checked={animations} onChange={setAnimations} />
      </Row>
      <Row label={<><Icon icon={Ruler} size={15} /> Distance units</>} help="How far a shot or a hole is shown. What you enter and what is stored don’t change.">
        <Segmented label="Distance units" size="sm" value={distance} options={DISTANCE_OPTIONS} onChange={setDistance} />
      </Row>
      {device.native && (
        <Row label={<><Icon icon={Vibrate} size={15} /> Haptics</>} help="Taps you feel on buttons, switches and saves.">
          <SettingSwitch label="Haptics" hideLabel checked={haptics} onChange={setHaptics} />
        </Row>
      )}
    </Card>
  );
}
