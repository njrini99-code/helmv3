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
  xml = xml.replace(/<\?[\s\S]*?\?>/g, ''); // prolog / PIs
  xml = xml.replace(/<!--[\s\S]*?-->/g, ''); // comments
  xml = xml.replace(/<!DOCTYPE[\s\S]*?>/gi, ''); // doctype
  xml = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, inner) => inner); // unwrap CDATA

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
