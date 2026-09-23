/**
 * Incident `rel:c1120074` — the same unvalidated-`[id]` defect the golf `[id]`
 * pages were fixed for in 44f4ce183, at the one public page nobody had checked.
 *
 * `/baseball/player/<not-a-valid-uuid>` passed a hand-typed string straight
 * into `resolvePublicProfileAccess` and then into `.eq('id', id)` against a
 * uuid column. Postgres answered `22P02 invalid input syntax for type uuid`,
 * and the page turned an unreadable row into a server error. The honest
 * answer to a malformed id is 404 — the row cannot exist, so there is nothing
 * for the database to be asked about.
 *
 * This page is PUBLIC and unauthenticated, so the malformed ids arrive from
 * crawlers and stale links rather than from a QA probe, and they arrive
 * continuously. Validating the shape before the query is the whole fix; the
 * existing access gate is untouched and still decides whether a real player's
 * profile may be shown.
 *
 * Contract over the source, matching `src/test/golf/id-pages-validate-uuid.test.ts`:
 * the guard must sit immediately after the param is read, at EVERY read —
 * `generateMetadata` included, because Next calls it on the same request.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES: Array<[string, string]> = [
  ['src/app/baseball/(public)/player/[id]/page.tsx', 'id'],
];

describe('baseball [id] pages answer a malformed id with 404, before Postgres sees it', () => {
  it.each(PAGES)('%s', (rel, param) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    expect(src).toContain("import { isUuid } from '@/lib/utils/uuid';");
    const guarded =
      src.match(
        new RegExp(`const \\{ ${param} \\} = await params;\\n\\s*if \\(!isUuid\\(${param}\\)\\) notFound\\(\\);`, 'g'),
      ) ?? [];
    const allReads = src.match(new RegExp(`const \\{ ${param} \\} = await params;`, 'g')) ?? [];
    expect(allReads.length).toBeGreaterThan(0);
    // Every read of the param is guarded, including generateMetadata's.
    expect(guarded.length).toBe(allReads.length);
  });
});
