/**
 * CONS-20 / row 48: colour says good or bad, and a sign or a word always goes with it, so the colour is never the only
 * carrier of the verdict. A toned element with text (a figure painted with `ch-gain`/`ch-loss` or `is-gain`/`is-loss`) must
 * carry a sign (+ or −) or a word that says which way. Marks with no text (a bar, a dot, a line) are read by the figure beside them.
 */
const SAYS = /[+−]|\b(up|down|better|worse|ahead|behind|gains?|loss|lower|higher|improving|slipping|under|over|losing|gaining|below|above)\b/i;

/** The toned figures in `root` that carry neither, as "tag.class :: text". */
export function unsignedTones(root: ParentNode = document): string[] {
  return [...root.querySelectorAll('.ch-gain, .ch-loss, .is-gain, .is-loss')].flatMap((el) => {
    const text = (el.textContent ?? '').trim();
    return text && !SAYS.test(text) ? [`${el.tagName.toLowerCase()}.${el.getAttribute('class')} :: ${text.slice(0, 60)}`] : [];
  });
}
