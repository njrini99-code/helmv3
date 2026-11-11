/**
 * Where a printed piece breaks across sheets. `blocks` are the parts that must stay whole (a schedule row, a rotation, a drill), as [top, bottom] measured from
 * the top of the content. A sheet is filled until the next whole block would not fit, then cut above that block, which is what `break-inside: avoid`
 * does on paper. A block taller than a sheet cannot be kept whole by anyone, so the sheet's own edge cuts it. Returns the cut positions; the piece needs
 * `cuts.length + 1` sheets.
 */
export function pageCuts(contentHeight: number, pageHeight: number, blocks: ReadonlyArray<readonly [number, number]>): number[] {
  const cuts: number[] = [];
  if (!(pageHeight > 0)) return cuts;
  let start = 0;
  // One pixel of slack: a piece that is a rounding error over one sheet is still one sheet.
  while (contentHeight - start > pageHeight + 1 && cuts.length < 200) {
    const limit = start + pageHeight;
    const split = blocks.filter(([top, bottom]) => top < limit && bottom > limit + 1 && top > start + 1).sort((a, b) => a[0] - b[0])[0];
    const cut = split ? split[0] : limit;
    cuts.push(cut);
    start = cut;
  }
  return cuts;
}

/**
 * What one printed sheet can hold, in CSS pixels: US Letter, portrait, less the 16mm margin `printNode` sets on every side (215.9mm by 279.4mm less 32mm each
 * way). Measured in the paginated render: the content came out 7.24in wide and a piece 9.8in tall did not fit.
 */
export const LETTER_CONTENT = { w: 695, h: 935 } as const;
