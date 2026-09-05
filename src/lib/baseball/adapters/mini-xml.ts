// =============================================================================
// src/lib/baseball/adapters/mini-xml.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// A tiny, dependency-free, server-safe XML reader for the attribute-based game
// files BaseballHelm imports (GameChanger college XML, StatCrew bsgame XML). The
// repo ships NO XML parser dependency and Node has NO DOMParser, so vendor XML
// adapters need this rather than "treat XML as text".
//
// SCOPE (deliberately small + honest): it parses well-formed element trees with
// attributes and nested children — which is exactly what StatCrew/GameChanger
// emit (e.g. <player name="Smith, J" pos="ss"><hitting ab="4" h="2"/></player>).
// It is NOT a general XML processor: no DTD, no namespaces resolution, no mixed
// text-and-element content semantics beyond capturing trimmed text. CDATA,
// comments, the prolog, and self-closing tags are handled. On malformed input it
// returns whatever it parsed plus a warning rather than throwing.
//
// PURE: no DB, no DOM.
// =============================================================================

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated direct text content, trimmed. */
  text: string;
}

export interface XmlParseResult {
  root: XmlNode | null;
  warnings: string[];
}

const VOID_OK = true; // self-closing allowed for any tag

/** Decode the 5 predefined XML entities + numeric refs. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&'); // ampersand last
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1]!.toLowerCase();
    const val = m[3] != null ? m[3] : (m[4] ?? '');
    attrs[key] = decodeEntities(val);
  }
  return attrs;
}

/**
 * Parse an XML document into a node tree. Returns the root element (the first
 * non-prolog element) or null if none was found.
 */
export function parseXml(input: string): XmlParseResult {
  const warnings: string[] = [];
  // Strip BOM, prolog, comments, CDATA-wrap (keep CDATA inner text), doctype.
  let xml = input.replace(/^\uFEFF/, '');
  // Extract CDATA sections FIRST — before the prolog/PI strip below and
  // before the comment-stripping pass further down — and restore them
  // verbatim at the very end. Per XML, CDATA content is not parsed as
  // markup at all, so none of the preprocessing regexes below may see
  // inside it:
  //
  //   - The bare-marker cleanup added for #459 (further down) strips every
  //     stray `-->` in the whole document, comment or not; a `-->` that is
  //     legal, literal CDATA content (verified: `<![CDATA[a --> b]]>` came
  //     out as `a  b` before this fix) is not exempt from a blind
  //     document-wide replace.
  //   - The prolog/PI strip `/<\?[\s\S]*?\?>/g` right below is lazy but not
  //     anchored to any one processing instruction: given a real
  //     `<?xml ... ?>` prolog earlier in the document and a `?>` inside a
  //     LATER CDATA section, the lazy `[\s\S]*?` is satisfied by the FIRST
  //     `?>` it finds — which can be the one inside CDATA — silently
  //     consuming every real element in between as if it were part of the
  //     prolog.
  //
  // Placeholders are delimited with U+E000, a Private Use Area code point
  // that cannot arise from real GameChanger/StatCrew text and, unlike a NUL
  // byte, is not an ASCII control character — so it does not trip eslint's
  // no-control-regex or turn this file into something grep/diff tooling
  // treats as binary.
  const cdataSections: string[] = [];
  xml = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, inner: string) => {
    const token = `CDATA${cdataSections.length}`;
    cdataSections.push(inner);
    return token;
  });

  xml = xml.replace(/<\?[\s\S]*?\?>/g, ''); // prolog / PIs

  // js/incomplete-multi-character-sanitization (#459): a single-pass
  // `<!--...-->/g` replace can leave a `<!--` behind \u2014 removing one
  // comment-pair match can concatenate what survives on either side of it
  // into a NEW, unremoved `<!--`/`-->` in the SAME global pass (the classic
  // "input.replace only scans once" gap). Vendor feeds are external data
  // (GameChanger/StatCrew), so loop until stable and strip any leftover bare
  // marker outright, matching the pattern in
  // src/lib/admin/pr-body-parser.ts's stripHtmlComments.
  let previousXml: string;
  do {
    previousXml = xml;
    xml = xml
      .replace(/<!--[\s\S]*?-->/g, '') // comments
      .replace(/<!--/g, '')
      .replace(/-->/g, '');
  } while (xml !== previousXml);
  xml = xml.replace(/<!DOCTYPE[\s\S]*?>/gi, ''); // doctype

  // Restore CDATA content verbatim, now that comment-stripping is done and
  // can no longer see (or corrupt) it.
  xml = xml.replace(
    /CDATA(\d+)/g,
    (_m, idx: string) => cdataSections[Number(idx)] ?? '',
  );

  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  const tagRe = /<\s*(\/?)\s*([\w:.-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)\s*(\/?)\s*>/g;

  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const isClose = m[1] === '/';
    const tag = m[2]!;
    const attrRaw = m[3] ?? '';
    const selfClose = m[4] === '/';

    // Capture text between previous tag and this one as the parent's text.
    const between = xml.slice(lastIndex, m.index).trim();
    if (between && stack.length > 0) {
      const parent = stack[stack.length - 1]!;
      parent.text = (parent.text ? parent.text + ' ' : '') + decodeEntities(between);
    }
    lastIndex = tagRe.lastIndex;

    if (isClose) {
      // Pop to the matching open tag (tolerate minor mismatches).
      const top = stack[stack.length - 1];
      if (top && top.tag.toLowerCase() === tag.toLowerCase()) {
        stack.pop();
      } else {
        // Mismatched close — find nearest matching open and unwind to it.
        const i = [...stack].reverse().findIndex((n) => n.tag.toLowerCase() === tag.toLowerCase());
        if (i >= 0) {
          const popCount = i + 1;
          for (let k = 0; k < popCount; k++) stack.pop();
          warnings.push(`Unbalanced close </${tag}> — recovered.`);
        } else {
          warnings.push(`Stray close </${tag}> — ignored.`);
        }
      }
      continue;
    }

    const node: XmlNode = { tag, attrs: parseAttrs(attrRaw), children: [], text: '' };
    if (stack.length > 0) {
      stack[stack.length - 1]!.children.push(node);
    } else if (!root) {
      root = node;
    } else {
      // Multiple roots — attach extras under a synthetic forest root.
      warnings.push(`Multiple root elements; wrapped <${tag}> under document root.`);
    }
    if (!selfClose || !VOID_OK) {
      stack.push(node);
    }
  }

  if (stack.length > 0) warnings.push(`${stack.length} unclosed element(s) at EOF.`);
  return { root, warnings };
}

/** Depth-first collect of every descendant element with the given tag name. */
export function findAll(node: XmlNode | null, tag: string): XmlNode[] {
  if (!node) return [];
  const want = tag.toLowerCase();
  const out: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    if (n.tag.toLowerCase() === want) out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(node);
  return out;
}



/** Read an attribute case-insensitively, trying several candidate names. */
export function attr(node: XmlNode, ...names: string[]): string | null {
  for (const name of names) {
    const v = node.attrs[name.toLowerCase()];
    if (v != null && v.trim() !== '') return v.trim();
  }
  return null;
}
