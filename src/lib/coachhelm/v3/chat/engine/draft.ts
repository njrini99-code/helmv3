/**
 * CoachHelm chat: a draft, shown as the model writes it.
 *
 * A tool's input arrives from the model as JSON in pieces. For a tool that says its input is a draft (`ToolBase.draft`), the
 * engine reads what has arrived so far and shows the listed fields as they fill in. What is shown is always something the model
 * has really finished writing:
 *   - a field whose value is complete is shown whole;
 *   - a list still being written is shown as the items that are finished (never a half-written item);
 *   - words still being written are shown up to the last whole word (never half a word, never half an escape);
 *   - anything else still open (a number, an object) is not shown until it is complete.
 * Nothing here is trusted: this is what the screen draws while the model writes. The input is validated by the tool's own schema
 * when it is complete, and only then planned.
 */

export interface PartialInput {
  /** The listed fields that have something to show, each with its whole value so far. */
  fields: Record<string, unknown>;
  /** The field the model is in the middle of writing, if it is one of the listed ones. */
  open: string | null;
}

/** Index just past the JSON value that starts at `from`, or -1 when the text ends before the value does. */
function endOfValue(text: string, from: number): number {
  const first = text[from];
  if (first === '"') {
    for (let i = from + 1; i < text.length; i += 1) {
      if (text[i] === '\\') i += 1;
      else if (text[i] === '"') return i + 1;
    }
    return -1;
  }
  if (first === '{' || first === '[') {
    let depth = 0;
    for (let i = from; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') {
        const end = endOfValue(text, i);
        if (end === -1) return -1;
        i = end - 1;
      } else if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
    }
    return -1;
  }
  // A number, true, false or null ends at the next delimiter; at the end of the text it may still be growing.
  for (let i = from; i < text.length; i += 1) if (',}] \n\r\t'.includes(text[i]!)) return i;
  return -1;
}

const skipSpace = (text: string, from: number): number => {
  let i = from;
  while (i < text.length && ' \n\r\t'.includes(text[i]!)) i += 1;
  return i;
};

const parse = (json: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch {
    return { ok: false };
  }
};

/** The words of a string that is still being written: decoded, and cut back to the last whole word. Null when there is none yet. */
function wordsSoFar(text: string, from: number): string | null {
  let body = text.slice(from + 1);
  // An escape the model has only half written is left for the next piece. (An even run of backslashes is whole escaped backslashes.)
  const tail = /(\\+)(u[0-9a-fA-F]{0,3})?$/.exec(body);
  if (tail && tail[1]!.length % 2 === 1) body = body.slice(0, tail.index + tail[1]!.length - 1);
  const decoded = parse(`"${body}"`);
  if (!decoded.ok || typeof decoded.value !== 'string') return null;
  const cut = decoded.value.search(/\s\S*$/);
  return cut <= 0 ? null : decoded.value.slice(0, cut);
}

/** The finished items of a list that is still being written. */
function itemsSoFar(text: string, from: number): unknown[] {
  const items: unknown[] = [];
  let i = skipSpace(text, from + 1);
  while (i < text.length && text[i] !== ']') {
    const end = endOfValue(text, i);
    if (end === -1) break;
    const item = parse(text.slice(i, end));
    if (!item.ok) break;
    items.push(item.value);
    i = skipSpace(text, end);
    if (text[i] === ',') i = skipSpace(text, i + 1);
  }
  return items;
}

/** What can be shown of a tool input the model is part-way through writing. `json` is the input so far; `fields` the ones to show. */
export function partialInput(json: string, fields: readonly string[]): PartialInput {
  const out: PartialInput = { fields: {}, open: null };
  let i = skipSpace(json, 0);
  if (json[i] !== '{') return out;
  i = skipSpace(json, i + 1);
  while (i < json.length && json[i] === '"') {
    const keyEnd = endOfValue(json, i);
    if (keyEnd === -1) return out;
    const key = parse(json.slice(i, keyEnd));
    i = skipSpace(json, keyEnd);
    if (!key.ok || typeof key.value !== 'string' || json[i] !== ':') return out;
    i = skipSpace(json, i + 1);
    if (i >= json.length) return out;
    const wanted = fields.includes(key.value);
    const end = endOfValue(json, i);
    if (end === -1) {
      // The model is writing this field now.
      if (wanted) {
        const partial = json[i] === '"' ? wordsSoFar(json, i) : json[i] === '[' ? itemsSoFar(json, i) : null;
        if (partial !== null && !(Array.isArray(partial) && partial.length === 0)) out.fields[key.value] = partial;
        out.open = key.value;
      }
      return out;
    }
    if (wanted) {
      const value = parse(json.slice(i, end));
      if (value.ok) out.fields[key.value] = value.value;
    }
    i = skipSpace(json, end);
    if (json[i] !== ',') return out;
    i = skipSpace(json, i + 1);
  }
  return out;
}
