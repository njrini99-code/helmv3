/**
 * A page stylesheet owns the classes it anchors: the first page class of a selector, after any shared
 * scope such as `.ch-root`. Two page stylesheets anchoring the same class style each other's pages, and
 * only one of them loads with its page, so the bug shows only after a visit: `.ch-rs` was Roster's and
 * Setup's and hid Setup on the phone; `.ch-ft` was Stats' and Calendar's and made the Stats table
 * unselectable. Styling another page's class inside your own (`.ch-rsu-tee > .ch-rd-tee`) is fine, and
 * the shared stylesheets' classes are everyone's.
 */
export const SHARED_STYLESHEETS = new Set(['base.css', 'controls.css', 'shell.css', 'tokens.css', 'ui.css']);

function selectors(css) {
  const out = [];
  // An at-rule's prelude (`@media (…)`, `@container chrsu (…)`) names no class, so it passes through harmlessly.
  for (const [, prelude] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)) {
    for (const s of prelude.split(',')) if (s.trim()) out.push(s.trim());
  }
  return out;
}

const classesIn = (compound) => [...compound.matchAll(/\.(ch-[A-Za-z0-9_-]+)/g)].map((m) => m[1]);

/** Every `ch-` class a stylesheet names. */
export function classesOf(css) {
  return new Set(selectors(css).flatMap(classesIn));
}

/** The classes a stylesheet anchors: per selector, the first class that isn't shared. */
export function anchorsOf(css, shared = new Set()) {
  const out = new Set();
  for (const sel of selectors(css)) {
    // A class inside :not(), :has() and the like qualifies its compound; it doesn't anchor it.
    const own = classesIn(sel.replace(/:[a-z-]+\([^()]*\)/g, '')).find((k) => !shared.has(k));
    if (own) out.add(own);
  }
  return out;
}

/** `sheets` maps a stylesheet's file name to its text. */
export function checkClassOwners(sheets, dir = 'src/clubhouse/styles') {
  const shared = new Set();
  for (const [name, css] of Object.entries(sheets)) if (SHARED_STYLESHEETS.has(name)) for (const k of classesOf(css)) shared.add(k);
  const owners = new Map();
  for (const [name, css] of Object.entries(sheets)) {
    if (SHARED_STYLESHEETS.has(name)) continue;
    for (const k of anchorsOf(css, shared)) owners.set(k, [...(owners.get(k) ?? []), name]);
  }
  return [...owners]
    .filter(([, names]) => names.length > 1)
    .map(([k, names]) => `${names.map((n) => `${dir}/${n}`).join(' and ')} both anchor .${k}: a page stylesheet's classes are its own, so rename one page's prefix`);
}
