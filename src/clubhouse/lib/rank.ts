/**
 * One rank rule (B13): places are taken on the value as it is shown, so two players shown with the same 74.3 share a
 * place ("T2") and the next place counts them both (1, T2, T2, 4). `digits` is the shown precision; lower is better
 * unless `higherIsBetter`. A null value has no place. Stats' TeamRank keeps its own "about the same" tie (one standard
 * error), because its words say so.
 */
export function displayPlaces(values: ReadonlyArray<number | null>, digits = 1, higherIsBetter = false): Array<{ place: number; tied: boolean } | null> {
  // Keyed on the printed figure itself: `toFixed` and `Math.round(v * 10 ** d)` disagree on x.x5 values (72.35 prints
  // "72.3" but rounds to 724), and the rule is about what the reader sees.
  const shown = values.map((v) => (v == null ? null : Number(v.toFixed(digits)) * (higherIsBetter ? -1 : 1)));
  return shown.map((s) => {
    if (s == null) return null;
    const ahead = shown.filter((o) => o != null && o < s).length;
    const tied = shown.filter((o) => o === s).length > 1;
    return { place: ahead + 1, tied };
  });
}

/** A place in words: "T2" when shared, else the number. */
export const placeLabel = (p: { place: number; tied: boolean }) => `${p.tied ? 'T' : ''}${p.place}`;
