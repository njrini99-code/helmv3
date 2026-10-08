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
