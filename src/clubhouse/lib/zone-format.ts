/**
 * A date formatter is expensive to build (it resolves the zone), and a screen that labels many instants builds one per label unless
 * each kind is kept: a thread one per bubble, a rail one per row, a week grid one per day (F-0010, the first frame after a route
 * switch). Each kind is built once per locale and zone and reused. `kind` names the options, so a key never has to serialise them; an
 * unknown zone throws here, as `new Intl.DateTimeFormat` always did, and is not stored. No zone is the runtime's own.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

export function zoneFormat(locale: string, timeZone: string | undefined, kind: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${kind}`;
  let fmt = FORMATTERS.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { timeZone, ...options });
    FORMATTERS.set(key, fmt);
  }
  return fmt;
}
