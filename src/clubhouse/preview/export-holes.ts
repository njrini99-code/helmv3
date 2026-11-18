import type { ChLibraryRound } from '../data/rounds-shape';
import type { ChReadRoundHoles } from '../screens/rounds/ExportRounds';
import type { ChExportHole } from '../screens/rounds/export';

/** A par-72 card, front then back; a course of another par trades a five or a three for a four until it adds up. */
const CARD = [4, 5, 4, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

const seed = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Made-up holes that add up to a preview round's score and par, the same every time for the same round. */
export function previewHoles(r: Pick<ChLibraryRound, 'id' | 'holes' | 'score' | 'toPar' | 'totalOnly'>): ChExportHole[] {
  if (r.totalOnly) return [];
  const n = r.holes === 9 ? 9 : 18;
  const pars = CARD.slice(0, n);
  const par = r.toPar == null ? pars.reduce((a, p) => a + p, 0) : r.score - r.toPar;
  for (let i = 0; pars.reduce((a, p) => a + p, 0) > par && i < n; i++) if (pars[i] === 5) pars[i] = 4;
  for (let i = 0; pars.reduce((a, p) => a + p, 0) < par && i < n; i++) if (pars[i] === 3) pars[i] = 4;
  const scores = [...pars];
  let left = r.score - scores.reduce((a, s) => a + s, 0);
  const start = seed(r.id) % n;
  for (let k = 0; left !== 0 && k < n * 4; k++) {
    const i = (start + k * 7) % n;
    if (left > 0) {
      scores[i] = scores[i]! + 1;
      left -= 1;
    } else if (scores[i]! > 2) {
      scores[i] = scores[i]! - 1;
      left += 1;
    }
  }
  return pars.map((p, i) => ({ n: i + 1, par: p, score: scores[i]! }));
}

/** The preview's Export read: no server, the holes made up from the rounds the page holds. */
export function previewReadRoundHoles(rounds: ReadonlyArray<Pick<ChLibraryRound, 'id' | 'holes' | 'score' | 'toPar' | 'totalOnly'>>): ChReadRoundHoles {
  const byId = new Map(rounds.map((r) => [r.id, r]));
  return async (ids) => {
    const data: Record<string, ChExportHole[]> = {};
    for (const id of ids) {
      const r = byId.get(id);
      if (r) data[id] = previewHoles(r);
    }
    return { success: true, data };
  };
}
