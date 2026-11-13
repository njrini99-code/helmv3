import { defaultFilter } from 'cmdk';
import type { ChCmdGroup, ChCommand } from './commands';

/**
 * How the palette orders what a search finds (coach audit 13 Nov 2026, §2: "larsen" lit "Qualifiers" above Larsen
 * Gallimore and Enter opened Qualifiers; "tar" offered Sawyer Slate and not the Tar Heel Shootout). cmdk scored every row
 * on scattered letters and kept the groups in the order they are written, so a faint match in Go to sat above an exact
 * name in People. Rows are ranked here instead, and the palette lights the first.
 *
 * A row's name typed whole ranks first, then a name that starts with the search, then a word of the name that does
 * ("gruse"), then a word of its other words ("schedule"). Scattered letters ("rostr", "calndr") are still found, under
 * those, but only when nothing matches by name: a person or event the coach named is never buried under noise.
 */
const NAME_WHOLE = 4;
const NAME_START = 3;
const NAME_WORD = 2.5;
const OTHER_WORD = 1.5;

const words = (s: string) => s.toLowerCase().split(/[\s·,/()\-–—]+/).filter(Boolean);

export function matchScore(c: Pick<ChCommand, 'label' | 'keywords'>, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const name = c.label.toLowerCase();
  if (name === q) return NAME_WHOLE;
  if (name.startsWith(q)) return NAME_START;
  // A search of more than one word matches words in order from any word of the name ("heel shoot").
  const nameWords = words(c.label);
  const qWords = words(q);
  if (qWords.length && nameWords.some((_, i) => qWords.every((w, k) => nameWords[i + k]?.startsWith(w)))) return NAME_WORD;
  if (c.keywords.some((k) => words(k).some((w) => w.startsWith(q)) || k.toLowerCase().startsWith(q))) return OTHER_WORD;
  // Under 1, so a fuzzy match never outranks a word match.
  return Math.min(0.99, defaultFilter([c.label, ...c.keywords].join(' '), q));
}

export interface ChRankedGroup {
  group: ChCmdGroup;
  rows: ChCommand[];
}

/**
 * The groups to show, best first, each with its rows best first. With nothing typed, the given groups in their own order
 * and every row as written. A tie keeps the written order (Go to before People before Events before Actions).
 */
export function rankCommands(commands: readonly ChCommand[], query: string, groups: readonly ChCmdGroup[]): ChRankedGroup[] {
  const q = query.trim();
  if (!q) {
    return groups.flatMap((group) => {
      const rows = commands.filter((c) => c.group === group);
      return rows.length ? [{ group, rows }] : [];
    });
  }
  const scored = commands.filter((c) => groups.includes(c.group)).map((c) => ({ c, score: matchScore(c, q) }));
  const named = scored.some((s) => s.score >= OTHER_WORD);
  const kept = scored.filter((s) => s.score > 0 && (!named || s.score >= OTHER_WORD));
  return groups
    .map((group, order) => {
      const rows = kept.filter((s) => s.c.group === group).sort((a, b) => b.score - a.score);
      return { group, order, best: rows[0]?.score ?? 0, rows: rows.map((s) => s.c) };
    })
    .filter((g) => g.rows.length)
    .sort((a, b) => b.best - a.best || a.order - b.order)
    .map(({ group, rows }) => ({ group, rows }));
}
