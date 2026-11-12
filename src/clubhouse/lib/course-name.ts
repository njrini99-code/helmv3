/**
 * A course name as players typed it, tidied for display only: "pine lakes" and "Pine lakes" both read "Pine Lakes". Stored
 * data is never changed, and grouping keeps using `normalizeName`, which ignores case and spacing anyway. A word holding a
 * capital is left as written ("GC", "McCabe", "No. 8"); a name in capitals throughout is cased too, short words apart ("CC").
 */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'the']);

const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export function tidyCourseName(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const shouting = words.length > 0 && words.some((w) => w.length > 3) && words.every((w) => w === w.toUpperCase());
  return words
    .map((w, i) => {
      const word = shouting && w.length > 3 ? w.toLowerCase() : w;
      if (word !== word.toLowerCase()) return word;
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      return word.split('-').map(capital).join('-');
    })
    .join(' ');
}
