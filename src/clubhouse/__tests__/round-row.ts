/**
 * A round row's summary, read off its face ("Sep 26, Finley GC, 72 (E)"): what its aria-label said before the row was named by
 * what it shows (MAC-09, PMAC-07). For tests that pick rows out of a list. Not a test file (no `.test.`).
 */
export function roundSummary(el: Element): string | null {
  if (!el.matches('.ch-rd-sc')) return null;
  const q = (s: string) => el.querySelector(s)?.textContent?.trim() ?? '';
  return `${q('.ch-rd-sc__date .ch-sr-only')} ${q('.ch-rd-sc__date b')}, ${q('.ch-rd-sc__c > b')}, ${q('.ch-rd-sc__s em')} (${q('.ch-rd-sc__s b')})`;
}
