/**
 * Pure, unit-tested day-bucketing for the Activity feed. Buckets are keyed
 * by the UTC calendar date of each item's `ts` (an ISO-8601 timestamp) —
 * deterministic regardless of server or CI runtime timezone, and matches
 * `today`/`yesterday` computed the same way (UTC slice), so "Today" never
 * disagrees with the boundary used elsewhere in this file.
 *
 * Assumes `items` is already sorted newest-first (fetchGolfActivity's
 * contract), so groups come out newest-day-first without re-sorting. Same-day
 * items are keyed into ONE group by day key (a Map, not positional
 * contiguity) — same-day items are always contiguous given sorted input, but
 * keying by value rather than position means out-of-order input still
 * coalesces correctly instead of silently splitting into duplicate groups.
 */

export interface ActivityDayGroup<T> {
  /** "Today" | "Yesterday" | "Jun 12" | "Jun 12, 2025". */
  label: string;
  dayKey: string;
  items: T[];
}

function dayKeyOf(iso: string): string {
  return iso.slice(0, 10);
}

function labelForDayKey(key: string, todayKey: string, yesterdayKey: string): string {
  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';

  const [yearStr, monthStr, dayStr] = key.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  const d = new Date(Date.UTC(year, month, day));
  const monthLabel = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const isCurrentYear = year === Number(todayKey.slice(0, 4));
  return isCurrentYear ? `${monthLabel} ${day}` : `${monthLabel} ${day}, ${year}`;
}

export function groupActivityByDay<T extends { ts: string }>(
  items: readonly T[],
  now: Date,
): ActivityDayGroup<T>[] {
  const todayKey = dayKeyOf(now.toISOString());
  const yesterdayKey = dayKeyOf(new Date(now.getTime() - 86_400_000).toISOString());

  const groups: ActivityDayGroup<T>[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    const key = dayKeyOf(item.ts);
    let idx = indexByKey.get(key);
    if (idx === undefined) {
      idx = groups.length;
      indexByKey.set(key, idx);
      groups.push({ label: labelForDayKey(key, todayKey, yesterdayKey), dayKey: key, items: [] });
    }
    groups[idx]!.items.push(item);
  }
  return groups;
}
