import { describe, expect, it } from 'vitest';
import { sunAt } from '../lib/sun';
import {
  clubhouseLightAt,
  lightFor,
  lightPlace,
  lightVars,
  MAX_DRIFT_PX,
  NEUTRAL_LIGHT,
  previewLightTime,
  ZONE_POINTS,
} from '../lib/light';

describe('sunAt (P001-A1)', () => {
  it('puts the equinox noon sun overhead at the equator', () => {
    const { altitude } = sunAt(Date.UTC(2025, 2, 20, 12, 7), { lat: 0, lng: 0 });
    expect(altitude).toBeGreaterThan(88.5);
  });

  it('puts the solstice noon sun at 90 - 40 + 23.44 degrees at latitude 40', () => {
    const { altitude, azimuth } = sunAt(Date.UTC(2025, 5, 21, 12, 2), { lat: 40, lng: 0 });
    expect(altitude).toBeCloseTo(73.44, 0);
    expect(Math.abs(azimuth - 180)).toBeLessThan(3);
  });

  it('rises in the east and sets in the west', () => {
    const pinehurst = { lat: 35.19, lng: -79.47 };
    // 7:30 and 18:15 Eastern Daylight Time on 14 October 2025.
    const morning = sunAt(Date.UTC(2025, 9, 14, 11, 30), pinehurst);
    const evening = sunAt(Date.UTC(2025, 9, 14, 22, 15), pinehurst);
    expect(morning.azimuth).toBeGreaterThan(90);
    expect(morning.azimuth).toBeLessThan(120);
    expect(evening.azimuth).toBeGreaterThan(240);
    expect(evening.azimuth).toBeLessThan(270);
    expect(sunAt(Date.UTC(2025, 9, 15, 4, 0), pinehurst).altitude).toBeLessThan(-30);
  });
});

describe('lightFor', () => {
  it('is overhead and neutral under a high noon sun', () => {
    const light = lightFor({ altitude: 70, azimuth: 180 });
    expect(light.x).toBeCloseTo(0.5, 2);
    expect(light.drift).toBeCloseTo(0, 2);
    expect(light.warmth).toBe(0);
    expect(light.night).toBe(0);
    expect(light.intensity).toBe(1);
  });

  it('comes from the left in the morning and the right in the evening, and leans the shadow away', () => {
    const morning = lightFor({ altitude: 8, azimuth: 100 });
    const evening = lightFor({ altitude: 8, azimuth: 260 });
    expect(morning.x).toBeLessThan(0.1);
    expect(morning.drift).toBeGreaterThan(4);
    expect(evening.x).toBeGreaterThan(0.9);
    expect(evening.drift).toBeLessThan(-4);
    expect(morning.warmth).toBeGreaterThan(0.5);
  });

  it('never leans a shadow further than the cap', () => {
    for (let az = 0; az < 360; az += 15) {
      for (const altitude of [-20, -4, 0, 3, 20, 60]) {
        expect(Math.abs(lightFor({ altitude, azimuth: az }).drift)).toBeLessThanOrEqual(MAX_DRIFT_PX);
      }
    }
  });

  it('is night, unwarmed and dark under the horizon', () => {
    const light = lightFor({ altitude: -30, azimuth: 0 });
    expect(light.night).toBe(1);
    expect(light.intensity).toBe(0);
    expect(light.warmth).toBe(0);
  });
});

describe('the light’s place and the shell’s variables', () => {
  it('prefers the course, then the team zone, then the default zone', () => {
    const now = Date.UTC(2025, 9, 14, 16);
    expect(lightPlace({ lat: 35.19, lng: -79.47 }, 'America/Denver', now)).toEqual({ lat: 35.19, lng: -79.47 });
    expect(lightPlace(null, 'America/Denver', now)).toBe(ZONE_POINTS['America/Denver']);
    expect(lightPlace(null, null, now)).toBe(ZONE_POINTS['America/New_York']);
    // An unlisted zone takes the meridian its offset implies.
    expect(lightPlace(null, 'Europe/London', Date.UTC(2025, 0, 10)).lng).toBe(0);
  });

  it('writes noon as the neutral light, matching the CSS fallbacks', () => {
    expect(lightVars(NEUTRAL_LIGHT)).toEqual({
      '--ch-sun-x': '0.5',
      '--ch-sun-y': '0.25',
      '--ch-sun-dir': '0',
      '--ch-sun-intensity': '1',
      '--ch-sun-warmth': '0',
      '--ch-sun-night': '0',
      '--ch-sun-drift': '0',
    });
  });

  it('holds the preview at a wall-clock time in the team zone', () => {
    const at = previewLightTime('18:30', 'America/New_York', Date.UTC(2025, 9, 14, 15));
    expect(at).toBe(Date.UTC(2025, 9, 14, 22, 30));
    expect(previewLightTime('25:00', 'America/New_York')).toBeNull();
    expect(previewLightTime(undefined, null)).toBeNull();
    // 6:30 pm in October in the Eastern zone is golden hour, with the light on the right.
    const evening = clubhouseLightAt(at!, null, 'America/New_York');
    expect(evening.x).toBeGreaterThan(0.85);
    expect(evening.warmth).toBeGreaterThan(0.3);
  });
});
