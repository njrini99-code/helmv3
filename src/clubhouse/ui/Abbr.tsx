/**
 * A golf abbreviation as it is shown, read in full (AX-10). The letters stay on screen; VoiceOver reads the words, so
 * "GIR" is "Greens in regulation" and not "G I R" or "gir". Unknown keys render as they are.
 */
const WORDS = {
  FIR: 'Fairways hit',
  GIR: 'Greens in regulation',
  SG: 'Strokes gained',
} as const;

export type ChAbbrKey = keyof typeof WORDS;

export function abbrWords(k: string): string {
  return (WORDS as Record<string, string>)[k] ?? k;
}

export function Abbr({ k }: { k: ChAbbrKey }) {
  return (
    <abbr className="ch-abbr" title={WORDS[k]}>
      <span aria-hidden="true">{k}</span>
      <span className="ch-sr-only">{WORDS[k]}</span>
    </abbr>
  );
}
