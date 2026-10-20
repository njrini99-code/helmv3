/**
 * Round-trip depth for a loader (perf, 2026-10-01). Reads sent through `supabase-fake` with `tables.gate = waves.gate` are held until
 * the loader has sent everything it can without an answer; then that wave is answered, and the loader moves on to what depended on
 * it. The waves it took are the loader's serial depth, which is the part of a page's wait that parallel reads and fewer hops buy back:
 *
 *   const waves = readWaves();
 *   tables.gate = waves.gate;
 *   const { result, waves: depth } = await waves.run(loadRoundsLibrary(...));
 *   expect(depth).toEqual([['golf_rounds', 'golf_rounds', 'golf_team_settings'], ['golf_holes']]);
 *
 * A server action or loader that is mocked can join in with `await waves.gate('name')`. Each wave is sorted: the order reads are sent in is not the point.
 */
export function readWaves() {
  let pending: Array<() => void> = [];
  let wave: string[] = [];
  const gate = (name: string) =>
    new Promise<void>((resolve) => {
      wave.push(name);
      pending.push(resolve);
    });
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  async function run<T>(work: Promise<T>): Promise<{ result: T; waves: string[][] }> {
    let done = false;
    let value: T | undefined;
    let failure: unknown;
    let failed = false;
    work.then(
      (v) => {
        done = true;
        value = v;
      },
      (e: unknown) => {
        done = true;
        failed = true;
        failure = e;
      },
    );
    const waves: string[][] = [];
    // A loader that never settles must fail the test, not hang it: a hundred waves is deeper than any page has.
    for (let i = 0; i < 100 && !done; i++) {
      await tick();
      if (!wave.length) continue;
      waves.push([...wave].sort());
      const release = pending;
      wave = [];
      pending = [];
      for (const r of release) r();
    }
    // Let the last answers land.
    await tick();
    if (!done) throw new Error('the loader did not settle');
    if (failed) throw failure;
    return { result: value as T, waves };
  }

  return { gate, run };
}
