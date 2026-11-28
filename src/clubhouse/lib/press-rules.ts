/**
 * The sheets' own pressed rules (dsx-08). The press controller (lib/press.ts) paints a shared pressed look on a control
 * whose sheet draws none, and it tells the two apart by watching what the mark changes on the control, its pseudo-elements,
 * its parent and its first children. A rule that keys the look to the mark through `:has()` or a sibling paints somewhere
 * it does not watch (the Activity island's step lights the row beside its hit area; the Home day card deepens its own
 * layer under the title's link), so it also asks the sheets: does a rule that names `[data-ch-pressed]` match now because
 * of this control? When one does, the sheet answers the press and the shared look stays off, so it never paints over what
 * the sheet drew.
 */

export type PressRule = {
  /** One complex selector, pseudo-elements dropped, as `querySelector` takes it. */
  selector: string;
  /** The compounds in it that carry the mark (outside `:not()`), each as `matches` takes it. */
  marks: string[];
  /** The media queries it sits under: its sheet's own, then each `@media` around it. */
  media: string[];
  /** The `@supports` conditions around it. */
  supports: string[];
};

const MARK = /^\[\s*data-ch-pressed\s*[\]=~|^$*]/;
const COMBINATOR = /[\s>+~,]/;
/** What a pressed rule draws with. A rule that only times a transition or sets a cursor does not answer a press. */
const LOOK = /^(?:background|color$|opacity$|box-shadow$|border|outline|text-decoration|text-shadow$|filter$|backdrop-filter$|-webkit-backdrop-filter$|scale$|transform$|translate$|rotate$|fill|stroke|visibility$|--)/;

/** A selector list's selectors: split at the commas between them, never at one inside `:is()`, `:has()` or an attribute. */
export function splitSelectorList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let bracket = false;
  let quote = '';
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i]!;
    if (ch === '\\') i++;
    else if (quote) quote = ch === quote ? '' : quote;
    else if (ch === '"' || ch === "'") quote = ch;
    else if (bracket) bracket = ch !== ']';
    else if (ch === '[') bracket = true;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(list.slice(start).trim());
  return out.filter(Boolean);
}

/** A selector without its pseudo-elements, so `querySelector` and `matches` take it (`.a::after` reads `.a`). */
export function withoutPseudoElements(selector: string): string {
  return selector.replace(/::[\w-]+(?:\([^()]*\))?|:(?:before|after|first-line|first-letter)(?![\w-])/gi, '');
}

/**
 * The compound selectors in one complex selector that carry `[data-ch-pressed]`, each read alone, pseudo-elements dropped:
 * `.ch-isl .st:has(.op[data-ch-pressed]) .row` gives `.op[data-ch-pressed]`. A mark inside `:not()` is the rule letting go
 * of a press, not drawing one, so it gives nothing.
 */
export function markedCompounds(selector: string): string[] {
  const n = selector.length;
  /** Each character's nesting depth: inside `:has(…)` is one deeper than the `:has` itself. */
  const depth: number[] = new Array(n).fill(0);
  /** Whether a character is structure (outside an attribute and a string), where a combinator can be. */
  const plain: boolean[] = new Array(n).fill(false);
  const marks: number[] = [];
  const open: string[] = [];
  let d = 0;
  let bracket = false;
  let quote = '';
  for (let i = 0; i < n; i++) {
    const ch = selector[i]!;
    depth[i] = d;
    if (ch === '\\') {
      if (i + 1 < n) depth[i + 1] = d;
      i++;
    } else if (quote) quote = ch === quote ? '' : quote;
    else if (ch === '"' || ch === "'") quote = ch;
    else if (bracket) bracket = ch !== ']';
    else if (ch === '[') {
      if (MARK.test(selector.slice(i)) && !open.includes('not')) marks.push(i);
      bracket = true;
    } else {
      plain[i] = true;
      if (ch === '(') {
        open.push(/([\w-]*)$/.exec(selector.slice(0, i))![1]!.toLowerCase());
        d++;
      } else if (ch === ')') {
        open.pop();
        d--;
        depth[i] = d;
      }
    }
  }
  const ends = (j: number, at: number) => plain[j] && (depth[j]! < at || (depth[j] === at && COMBINATOR.test(selector[j]!)));
  const out: string[] = [];
  for (const s of marks) {
    const at = depth[s]!;
    let from = s - 1;
    while (from >= 0 && !ends(from, at)) from--;
    let to = s + 1;
    while (to < n && !plain[to]) to++;
    while (to < n && !ends(to, at)) to++;
    const compound = withoutPseudoElements(selector.slice(from + 1, to)).trim();
    if (compound) out.push(compound);
  }
  return out;
}

const is = (rule: CSSRule, name: string) => {
  const kind = (globalThis as Record<string, unknown>)[name];
  return typeof kind === 'function' && rule instanceof (kind as new () => CSSRule);
};
const looks = (style: CSSStyleDeclaration) => {
  for (let i = 0; i < style.length; i++) if (LOOK.test(style[i]!)) return true;
  return false;
};

/** The pressed rules in a list of rules, with the conditions they sit under. */
function collect(rules: CSSRuleList, media: string[], supports: string[], out: PressRule[]) {
  for (const rule of Array.from(rules)) {
    // A container query, a scope or a starting style cannot be read from here: their rules stay with the controller's
    // own watch of the control, which sees a rule on the control itself whenever it applies.
    if (is(rule, 'CSSContainerRule') || is(rule, 'CSSScopeRule') || is(rule, 'CSSStartingStyleRule') || is(rule, 'CSSKeyframesRule')) continue;
    const style = rule as CSSStyleRule;
    if (typeof style.selectorText === 'string' && style.style) {
      if (!style.selectorText.includes('data-ch-pressed') || !looks(style.style)) continue;
      for (const one of splitSelectorList(style.selectorText)) {
        const marks = markedCompounds(one);
        if (marks.length) out.push({ selector: withoutPseudoElements(one), marks, media, supports });
      }
      continue;
    }
    const group = rule as CSSGroupingRule & { media?: MediaList; conditionText?: string; styleSheet?: CSSStyleSheet };
    if (group.styleSheet) {
      read(group.styleSheet, media, supports, out);
      continue;
    }
    if (!group.cssRules) continue;
    // `@media` carries its query; `@supports` only its condition; `@layer` neither.
    const query = group.media ? group.media.mediaText : '';
    const condition = !group.media && typeof group.conditionText === 'string' ? group.conditionText : '';
    collect(group.cssRules, query ? [...media, query] : media, condition ? [...supports, condition] : supports, out);
  }
}
function read(sheet: CSSStyleSheet, media: string[], supports: string[], out: PressRule[]) {
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return; // Another origin's sheet keeps its rules to itself.
  }
  collect(rules, sheet.media?.mediaText ? [...media, sheet.media.mediaText] : media, supports, out);
}

/** Each sheet read once, and again only when its rules change (a dev reload adds them in place). */
const cache = new WeakMap<CSSStyleSheet, { size: number; rules: PressRule[] }>();
const size = (sheet: CSSStyleSheet) => {
  try {
    return sheet.cssRules.length;
  } catch {
    return -1;
  }
};

/** The pressed rules of every sheet on the page now. */
export function pressRules(doc: Document): PressRule[] {
  const out: PressRule[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    if (sheet.disabled) continue;
    const n = size(sheet);
    let hit = cache.get(sheet);
    if (!hit || hit.size !== n) {
      hit = { size: n, rules: [] };
      read(sheet, [], [], hit.rules);
      cache.set(sheet, hit);
    }
    out.push(...hit.rules);
  }
  return out;
}

const tries = (f: () => boolean) => {
  try {
    return f();
  } catch {
    return false; // A selector this engine does not know never answers.
  }
};

/**
 * Whether a sheet draws this control's pressed look somewhere: a pressed rule whose mark this control carries, under
 * conditions that hold, matches an element now. Call it with the mark set. Only the pressed control carries the mark, so a
 * rule that matches with it set matches because of it.
 */
export function sheetAnswersPress(target: Element, rules: readonly PressRule[] = pressRules(target.ownerDocument)): boolean {
  const doc = target.ownerDocument;
  const win = doc.defaultView;
  const media = (q: string) => !win?.matchMedia || q === '' || q === 'all' || win.matchMedia(q).matches;
  const supports = (c: string) => typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports(c);
  return rules.some(
    (r) =>
      r.marks.some((m) => tries(() => target.matches(m))) &&
      r.media.every(media) &&
      r.supports.every(supports) &&
      tries(() => doc.querySelector(r.selector) !== null),
  );
}
