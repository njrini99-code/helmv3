/**
 * clubhouse:check, link check: every relative markdown link in docs/clubhouse/**
 * must resolve to a file or directory in the repo, and, when it points into a
 * markdown file with a #fragment, to a heading there (GitHub's slug rules).
 * Links in code spans and fenced code are examples and are skipped; so are
 * http(s), mailto and site-absolute (/golf/...) targets.
 */
import { posix } from 'node:path';

/** Replaces fenced code and inline code with spaces, keeping line numbers and offsets. */
export function blankCode(md) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return md.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank).replace(/`[^`\n]*`/g, blank);
}

/** GitHub's heading slug: lowercase, inline markup removed, punctuation dropped, spaces to hyphens. */
export function slugify(heading) {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

/** The set of anchors a markdown file offers (repeated headings get -1, -2). */
export function anchorsOf(md) {
  const seen = new Map();
  const out = new Set();
  for (const line of blankCode(md).split('\n')) {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = slugify(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

/** `[text](target)` and `![alt](target)` outside code, with 1-based line numbers. */
export function extractLinks(md) {
  const links = [];
  const src = blankCode(md);
  for (const m of src.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>\n]*>|[^)\s\n]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g)) {
    links.push({ target: m[1].replace(/^<|>$/g, ''), line: src.slice(0, m.index).split('\n').length });
  }
  return links;
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/)/i;

/**
 * `files` maps repo-relative markdown paths to their text; `exists` and `read`
 * look at the rest of the repo. Returns one violation per unresolved link.
 */
export function checkLinks({ files, exists, read }) {
  const v = [];
  const anchorCache = new Map();
  const anchors = (path) => {
    if (!anchorCache.has(path)) anchorCache.set(path, anchorsOf(path in files ? files[path] : read(path)));
    return anchorCache.get(path);
  };
  for (const [file, md] of Object.entries(files)) {
    for (const { target, line } of extractLinks(md)) {
      if (target === '' || EXTERNAL.test(target)) continue;
      const hash = target.indexOf('#');
      const rawPath = hash < 0 ? target : target.slice(0, hash);
      const fragment = hash < 0 ? '' : target.slice(hash + 1);
      let decoded;
      try {
        decoded = decodeURI(rawPath);
      } catch {
        v.push(`${file}:${line} link "${target}" is not a valid URL`);
        continue;
      }
      const resolved = rawPath === '' ? file : posix.normalize(posix.join(posix.dirname(file), decoded));
      if (resolved.startsWith('..')) {
        v.push(`${file}:${line} link "${target}" leaves the repository`);
        continue;
      }
      const inFiles = resolved in files;
      if (!inFiles && !exists(resolved)) {
        v.push(`${file}:${line} link "${target}" does not resolve (${resolved} is missing)`);
        continue;
      }
      if (fragment && resolved.endsWith('.md') && !anchors(resolved).has(decodeURIComponent(fragment).toLowerCase())) {
        v.push(`${file}:${line} link "${target}" has no heading "#${fragment}" in ${resolved}`);
      }
    }
  }
  return v;
}
