/**
 * Splits `docs/v3-research-golf-domain.md` (the sourced golf reference) into sections for Ask's `get_golf_reference`.
 * Pure: the generator (`scripts/coachhelm/gen-golf-reference.ts`) writes the result to `golf-reference.generated.ts`, and a test
 * recomputes it from the document, so the module cannot drift from the doc.
 *
 * A section is one `###` block, or the text under a `##` heading before its first `###`. Two parts of the document are not
 * golf knowledge for a coach: the engine's own constraints (rules for the generators) and the title block. The closing
 * source list is kept, as its own section, so the model can name where a figure comes from.
 */

export interface GolfReferenceSection {
  /** Stable slug: `<chapter>/<heading>`. */
  id: string;
  /** The `##` chapter, e.g. "3. College Golf Baselines". */
  chapter: string;
  /** The `###` heading, or the chapter title again for the text under a `##`. */
  heading: string;
  /** The section's markdown, trimmed. Source links stay in it. */
  text: string;
}

/** Chapters left out: they instruct the engine's generators, not the coach. */
const EXCLUDED_CHAPTERS = [/^ENGINE IMPLICATIONS/i];
/** Lines left out wherever they sit: they point at internal planning docs. */
const EXCLUDED_LINES = [/docs\/v3-master-plan\.md/];

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function splitGolfReference(markdown: string): GolfReferenceSection[] {
  const sections: GolfReferenceSection[] = [];
  let chapter: string | null = null;
  let heading: string | null = null;
  let lines: string[] = [];

  const flush = () => {
    if (chapter && heading && !EXCLUDED_CHAPTERS.some((re) => re.test(chapter as string))) {
      const text = lines
        .filter((l) => !EXCLUDED_LINES.some((re) => re.test(l)))
        .join('\n')
        .replace(/^\s*---\s*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (text) sections.push({ id: `${slug(chapter)}/${slug(heading)}`, chapter, heading, text });
    }
    lines = [];
  };

  for (const line of markdown.split('\n')) {
    const h2 = /^## (.+)$/.exec(line);
    const h3 = /^### (.+)$/.exec(line);
    if (h2) {
      flush();
      chapter = h2[1]!.trim();
      heading = chapter;
    } else if (h3) {
      flush();
      heading = h3[1]!.trim();
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}
