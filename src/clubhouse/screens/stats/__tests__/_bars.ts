/** The top and bottom of a bar drawn with absolute M, H, V, A and Z commands, as `parBarPath` writes it. */
export function barYs(d: string): { top: number; bottom: number; left: number; right: number } {
  const ys: number[] = [];
  const xs: number[] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MHVAZ])([^MHVAZ]*)/g)) {
    const n = (args ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'M') [x, y] = [n[0]!, n[1]!];
    else if (cmd === 'H') x = n[0]!;
    else if (cmd === 'V') y = n[0]!;
    else if (cmd === 'A') [x, y] = [n[5]!, n[6]!];
    else continue;
    xs.push(x);
    ys.push(y);
  }
  return { top: Math.min(...ys), bottom: Math.max(...ys), left: Math.min(...xs), right: Math.max(...xs) };
}
