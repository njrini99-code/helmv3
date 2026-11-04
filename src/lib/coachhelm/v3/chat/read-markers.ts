/** `[e2]` after a sentence names the read that sentence's figure came from (Ask v2). Pure, shared by the server audit and the client's chips. */
const MARKER = /\s?\[e(\d+)\]/g;

/** The text with its read markers out, for the numeric audit and the stored `content`: the "2" in `e2` is not a claim. */
export function stripReadMarkers(text: string): string {
  return text.replace(MARKER, '');
}

/** Text and refs, in order. A ref the turn doesn't hold is dropped, never drawn. */
export function splitReadMarkers(text: string, known: ReadonlySet<string>): Array<{ text: string } | { ref: string }> {
  const out: Array<{ text: string } | { ref: string }> = [];
  let at = 0;
  for (const m of text.matchAll(MARKER)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i) });
    const ref = `e${m[1]}`;
    if (known.has(ref)) out.push({ ref });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
