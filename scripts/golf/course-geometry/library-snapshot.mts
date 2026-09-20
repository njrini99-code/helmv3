/** Read a complete, stably ordered table; never export a capped/partial inventory. */
export async function readAllRows<T extends { id: string }>(
  name: string,
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null; error: { message: string } | null; count: number | null;
  }>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expected: number | null = null;
  for (let page = 0; page < 2000; page += 1) {
    const result = await query(rows.length, rows.length + pageSize - 1);
    if (result.error) throw new Error(`${name}: ${result.error.message}`);
    if (result.count === null || result.data === null) throw new Error(`${name}: completeness unavailable`);
    if (expected !== null && expected !== result.count) throw new Error(`${name}: table changed during export; retry`);
    expected = result.count;
    for (const row of result.data) {
      if (ids.has(row.id)) throw new Error(`${name}: duplicate row across pages; retry`);
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length === expected) return rows;
    if (rows.length > expected || result.data.length === 0) throw new Error(`${name}: incomplete export`);
  }
  throw new Error(`${name}: pagination safety limit reached`);
}

/** Count alone is insufficient: duplicates/gaps must never become a scorecard. */
export function completeScorecard(holes: { number: number; par: number; yardage: number }[], count: number): boolean {
  return Number.isInteger(count) && count >= 9 && count <= 36 && holes.length === count
    && holes.every((hole, index) => hole.number === index + 1
      && Number.isInteger(hole.par) && hole.par >= 3 && hole.par <= 6
      && Number.isInteger(hole.yardage) && hole.yardage >= 50 && hole.yardage <= 800);
}
