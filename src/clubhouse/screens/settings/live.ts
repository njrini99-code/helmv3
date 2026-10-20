import type { Dispatch, SetStateAction } from 'react';
import type { PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';
import { channelsFor, type ChCoachHelmSettings, type ChResult, type ChSettingsData, type ChSettingsWrites } from './model';

/**
 * A section remounts from the page's data every time it opens, and the page's
 * data is what the server rendered. Without this, a value saved in a section
 * comes back as it was when the page loaded once the person leaves the
 * section and returns (and a coach's first CoachHelm save would create its
 * row a second time). `keepSaved` wraps the writes: each one that lands also
 * patches the page's copy of the data. A failed write patches nothing, and a
 * fresh server read replaces the copy (SettingsView).
 */

type SetData = Dispatch<SetStateAction<ChSettingsData>>;

const ok = <T,>(value: T) => ({ value, error: false as const });
const landed = (r: ChResult) => !!(r.success || r.ok);

type Routing = { prefs: PrefsByCategory; quiet: boolean };
const withRouting = (d: ChSettingsData, change: (r: Routing) => Routing): ChSettingsData =>
  d.playerRouting && !d.playerRouting.error ? { ...d, playerRouting: ok(change(d.playerRouting.value)) } : d;

const withCoachHelm = (d: ChSettingsData, change: (c: ChCoachHelmSettings) => ChCoachHelmSettings): ChSettingsData =>
  d.coachhelm && !d.coachhelm.error ? { ...d, coachhelm: ok(change(d.coachhelm.value)) } : d;

export function keepSaved(writes: ChSettingsWrites, set: SetData): ChSettingsWrites {
  const keep =
    <A extends unknown[], R extends ChResult>(write: (...a: A) => Promise<R>, patch: (d: ChSettingsData, r: R, ...a: A) => ChSettingsData) =>
    async (...a: A): Promise<R> => {
      const r = await write(...a);
      if (landed(r)) set((d) => patch(d, r, ...a));
      return r;
    };

  return {
    ...writes,
    saveProfile: keep(writes.saveProfile, (d, _r, p) => ({
      ...d,
      profile: ok({ ...p, fullName: d.role === 'coach' ? p.fullName.trim() : [p.firstName.trim(), p.lastName.trim()].filter(Boolean).join(' ') }),
    })),
    setDelivery: keep(writes.setDelivery, (d, _r, key, value) => (d.delivery.error ? d : { ...d, delivery: ok({ ...d.delivery.value, [key]: value }) })),
    setDigest: keep(writes.setDigest, (d, _r, on) => (d.digest && !d.digest.error ? { ...d, digest: ok(on) } : d)),
    setRoutingCell: keep(writes.setRoutingCell, (d, _r, c, channel, on) =>
      withRouting(d, (r) => ({ ...r, prefs: { ...r.prefs, [c]: { ...channelsFor(r.prefs, c), [channel]: on } } })),
    ),
    setRoutingAll: keep(writes.setRoutingAll, (d, _r, prefs) => withRouting(d, (r) => ({ ...r, prefs }))),
    setRoutingQuiet: keep(writes.setRoutingQuiet, (d, _r, on) => withRouting(d, (r) => ({ ...r, quiet: on }))),
    saveScoring: keep(writes.saveScoring, (d, _r, s) => ({ ...d, scoring: ok(s) })),
    saveReminders: keep(writes.saveReminders, (d, _r, r) => ({ ...d, reminders: ok(r) })),
    saveTeam: keep(writes.saveTeam, (d, _r, t) => ({ ...d, team: ok(t), teamName: t.name.trim() })),
    regenerateCode: keep(writes.regenerateCode, (d, r) => (r.data?.joinCode ? { ...d, joinCode: ok(r.data.joinCode) } : d)),
    saveGolf: keep(writes.saveGolf, (d, _r, g) => ({ ...d, golf: ok(g) })),
    cancelRequest: keep(writes.cancelRequest, (d, _r, id) =>
      d.membership && !d.membership.error ? { ...d, membership: ok({ ...d.membership.value, requests: d.membership.value.requests.filter((q) => q.id !== id) }) } : d,
    ),
    setCoachHelmCoach: keep(writes.setCoachHelmCoach, (d, _r, patch) => withCoachHelm(d, (c) => ({ ...c, coach: { ...c.coach, ...patch } }))),
    setCoachHelmTeam: keep(writes.setCoachHelmTeam, (d, _r, enabled) =>
      withCoachHelm(d, (c) => (c.team ? { ...c, team: { ...c.team, enabled, disabledAt: enabled ? null : new Date().toISOString() } } : c)),
    ),
    // The first save creates the row and returns its id; the id is kept so the next save updates it (the typed id is never null, the loader's is until then).
    savePhilosophy: keep(writes.savePhilosophy, (d, r, id, patch) =>
      withCoachHelm(d, (c) => ({ ...c, philosophy: { ...c.philosophy, ...patch, id: r.data?.id ?? id } as ChCoachHelmSettings['philosophy'] })),
    ),
  };
}
