/**
 * The global light (P001-A1, D3-1): one sun for the whole Clubhouse, from the team's course location and the time.
 *
 * Pure: the sun (lib/sun.ts) becomes a handful of plain numbers that the shell writes as --ch-sun-* custom properties on
 * <html> (shell/light.tsx). Every colour, rim and shadow is derived from those numbers in tokens.css, per theme, so the
 * dark theme keeps its own moonlight and nothing here knows a colour. The light falls on the frame and the materials
 * (cards, sheets, keys), never on data.
 *
 * Screen convention, shared with the sign-in sky (screens/auth/scene-sky.ts): the morning sun is on the left, the
 * evening sun on the right, a high sun near the top.
 */
import { sunAt, type LatLng, type SunPosition } from './sun';

export interface ClubhouseLight {
  /** Where the light comes from across the screen: 0 left (morning), 0.5 overhead, 1 right (evening). */
  x: number;
  /** How high it is: 0 at the zenith, 1 on the horizon. */
  y: number;
  /** x as a direction, -1 (left) to 1 (right). */
  dir: number;
  /** How strong the daylight is: 0 at night, 1 under a high sun. */
  intensity: number;
  /** Golden hour: 0 under a high sun and at night, 1 with the sun just above the horizon. */
  warmth: number;
  /** Night: 0 by day, 1 once civil twilight is over. */
  night: number;
  /** The contact shadow's sideways lean in px, away from the light: signed, at most 6. */
  drift: number;
}

/** Noon on the server and through hydration (and the CSS fallbacks in tokens.css match it). */
export const NEUTRAL_LIGHT: ClubhouseLight = { x: 0.5, y: 0.25, dir: 0, intensity: 1, warmth: 0, night: 0, drift: 0 };

/** The shell recomputes the light on this period (a few times an hour; the sun moves about a degree every 4 minutes). */
export const LIGHT_PERIOD_MS = 5 * 60_000;

/** The longest lean a contact shadow takes, in px (owner brief: 2–6px drift at most). */
export const MAX_DRIFT_PX = 6;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const round = (v: number, places = 3): number => {
  const k = 10 ** places;
  return Math.round(v * k) / k + 0; // + 0 turns -0 into 0
};

/**
 * Where each team time zone's sun is taken from until the course location is set: a representative point inside the
 * zone's US population (Settings offers these six; scripts/clubhouse or a migration can add more).
 */
export const ZONE_POINTS: Readonly<Record<string, LatLng>> = {
  'America/New_York': { lat: 38.9, lng: -78.5 },
  'America/Chicago': { lat: 37.5, lng: -91.5 },
  'America/Denver': { lat: 39.5, lng: -106.5 },
  'America/Phoenix': { lat: 33.5, lng: -112 },
  'America/Los_Angeles': { lat: 37, lng: -120 },
  'America/Anchorage': { lat: 61.2, lng: -149.9 },
  'Pacific/Honolulu': { lat: 21.3, lng: -157.9 },
};

/** The zone's standard offset in hours at an instant (-5 for New York in winter), or null for an unknown zone. */
function zoneOffsetHours(timeZone: string, at: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    if (!m) return name === 'GMT' ? 0 : null;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3] ?? 0) / 60);
  } catch {
    return null;
  }
}

/**
 * The place the light is computed for: the team's course when it is set, otherwise the team's time zone (a known zone's
 * point, or the meridian its offset implies at a temperate latitude), otherwise the product default zone.
 */
export function lightPlace(course: LatLng | null | undefined, timeZone: string | null | undefined, at: number): LatLng {
  if (course && Number.isFinite(course.lat) && Number.isFinite(course.lng)) return course;
  const zone = timeZone || 'America/New_York';
  const known = ZONE_POINTS[zone];
  if (known) return known;
  const offset = zoneOffsetHours(zone, at);
  return offset === null ? ZONE_POINTS['America/New_York']! : { lat: 38, lng: offset * 15 };
}

/** The light for a sun position. */
export function lightFor(sun: SunPosition): ClubhouseLight {
  const alt = sun.altitude;
  // Day grows through civil twilight (-6) to a clear sky (+10); full strength comes with height.
  const day = smoothstep(-6, 10, alt);
  const intensity = day * (0.6 + 0.4 * smoothstep(10, 50, alt));
  const warmth = smoothstep(-6, 1, alt) * (1 - smoothstep(6, 24, alt));
  const night = 1 - smoothstep(-12, -3, alt);
  // East-west across the screen: azimuth 90 (east) is the left edge, 270 (west) the right edge, either hemisphere.
  const sunX = 0.5 - 0.5 * Math.sin(sun.azimuth * (Math.PI / 180));
  // Under the horizon the key light eases to a high moon, a little right of centre, so night still has a direction.
  const x = sunX + (0.62 - sunX) * night;
  const sunY = 1 - clamp01(alt / 70);
  const y = sunY + (0.2 - sunY) * night;
  const dir = (x - 0.5) * 2;
  // A low sun throws a longer shadow (2px overhead to 6px at the horizon); the lean is away from the light.
  const reach = 2 + (MAX_DRIFT_PX - 2) * (1 - clamp01(Math.max(alt, 0) / 60));
  const drift = Math.max(-MAX_DRIFT_PX, Math.min(MAX_DRIFT_PX, -dir * reach * (1 - 0.6 * night)));
  return {
    x: round(x),
    y: round(y),
    dir: round(dir),
    intensity: round(intensity),
    warmth: round(warmth),
    night: round(night),
    drift: round(drift, 2),
  };
}

/** The light now, for a team. */
export function clubhouseLightAt(at: number, course: LatLng | null | undefined, timeZone: string | null | undefined): ClubhouseLight {
  return lightFor(sunAt(at, lightPlace(course, timeZone, at)));
}

/** The custom properties the shell writes on <html> (unitless numbers; tokens.css derives the rest). */
export function lightVars(light: ClubhouseLight): Record<`--ch-sun-${string}`, string> {
  return {
    '--ch-sun-x': String(light.x),
    '--ch-sun-y': String(light.y),
    '--ch-sun-dir': String(light.dir),
    '--ch-sun-intensity': String(light.intensity),
    '--ch-sun-warmth': String(light.warmth),
    '--ch-sun-night': String(light.night),
    '--ch-sun-drift': String(light.drift),
  };
}

/** A preview's ?at= ("06:45", "18:30") as that wall-clock time today in the team's zone; null when absent or malformed. */
export function previewLightTime(value: string | null | undefined, timeZone: string | null | undefined, today: number = Date.now()): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const offset = zoneOffsetHours(timeZone || 'America/New_York', today) ?? 0;
  const local = new Date(today + offset * 3_600_000);
  const utcMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return utcMidnight + (Number(m[1]) * 60 + Number(m[2]) - offset * 60) * 60_000;
}
