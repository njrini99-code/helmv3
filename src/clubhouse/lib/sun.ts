/**
 * Where the sun is, computed locally (NOAA's low-precision solar position, good to about a tenth of a degree for the
 * years this app will run). No network, no ephemeris: the global light (lib/light.ts) reads only this.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SunPosition {
  /** Degrees above the horizon; negative below it (civil twilight ends at -6). */
  altitude: number;
  /** Degrees clockwise from true north: 90 east, 180 south, 270 west. */
  azimuth: number;
}

const RAD = Math.PI / 180;
const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** The sun's altitude and azimuth at an instant, for a place. */
export function sunAt(when: Date | number, at: LatLng): SunPosition {
  const ms = typeof when === 'number' ? when : when.getTime();
  // Days since J2000.0 (2000-01-01 12:00 UT).
  const n = ms / 86_400_000 + 2_440_587.5 - 2_451_545;
  const meanLong = wrap360(280.46 + 0.9856474 * n);
  const anomaly = wrap360(357.528 + 0.9856003 * n) * RAD;
  const eclipticLong = (meanLong + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLong), Math.cos(eclipticLong));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLong));
  // Greenwich mean sidereal time in degrees, then the local hour angle.
  const gmst = wrap360(280.46061837 + 360.98564736629 * n);
  const hourAngle = (wrap360(gmst + at.lng) * RAD) - rightAscension;
  const lat = at.lat * RAD;
  const sinAlt = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
  const azimuth = wrap360(
    Math.atan2(
      -Math.cos(declination) * Math.sin(hourAngle),
      Math.sin(declination) * Math.cos(lat) - Math.cos(declination) * Math.cos(hourAngle) * Math.sin(lat),
    ) / RAD,
  );
  return { altitude, azimuth };
}

export interface SunTimes {
  /** Epoch ms; null when the sun does not rise or set that day (polar day or night). */
  sunrise: number | null;
  sunset: number | null;
  /** When the evening light turns golden (the sun at 6 degrees on its way down); null as above. */
  goldenStart: number | null;
}

/** Midnight of a calendar day (YYYY-MM-DD) in a time zone, as epoch ms. */
function zoneMidnight(dayYmd: string, timeZone: string): number {
  const [y, m, d] = dayYmd.split('-').map(Number);
  const utc = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  // The zone's offset at that instant, read back from the formatter, then applied once more for a DST edge.
  const offsetAt = (t: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(t);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - t;
  };
  const first = utc - offsetAt(utc);
  return utc - offsetAt(first);
}

/** The instant the sun crosses `altitude` between `from` and `to` (altitudes on either side), by bisection to a second. */
function crossing(from: number, to: number, at: LatLng, altitude: number): number {
  let lo = from;
  let hi = to;
  const rising = sunAt(lo, at).altitude < altitude;
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2;
    if (sunAt(mid, at).altitude < altitude === rising) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/**
 * Sunrise, sunset and the start of golden hour on a day, for a place, in its time zone (sunrise and sunset at the
 * standard -0.833 degrees, refraction and the sun's radius). Pure and local, like `sunAt`.
 */
export function sunTimes(dayYmd: string, at: LatLng, timeZone: string): SunTimes {
  const start = zoneMidnight(dayYmd, timeZone);
  const step = 10 * 60_000;
  const rise = -0.833;
  let sunrise: number | null = null;
  let sunset: number | null = null;
  let goldenStart: number | null = null;
  let prev = sunAt(start, at).altitude;
  for (let t = start + step; t <= start + 24 * 3_600_000; t += step) {
    const alt = sunAt(t, at).altitude;
    if (sunrise === null && prev < rise && alt >= rise) sunrise = crossing(t - step, t, at, rise);
    if (prev >= 6 && alt < 6 && goldenStart === null) goldenStart = crossing(t - step, t, at, 6);
    if (prev >= rise && alt < rise) sunset = crossing(t - step, t, at, rise);
    prev = alt;
  }
  return { sunrise, sunset, goldenStart };
}
