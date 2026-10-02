import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * Baseline captures for the UI audit (GolfHelm_Free_UI_UX_Testing_and_Audit_Chain, stage 2). These are evidence, NOT
 * approved snapshot baselines: nothing compares against them. They go under `.helm/runtime/ui-audit/` (gitignored) and
 * each one is logged, with the environment it was taken in, to `captures.jsonl` beside the images.
 */
export const EVIDENCE_DIR = join(process.cwd(), '.helm', 'runtime', 'ui-audit');

let commit = '';
function head(): string {
  // UI_AUDIT_COMMIT names the commit the server under test was built from, when that is not this checkout's HEAD (a frozen copy).
  if (!commit && process.env.UI_AUDIT_COMMIT) commit = process.env.UI_AUDIT_COMMIT;
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
      commit = 'unknown';
    }
  }
  return commit;
}

export interface EvidenceInput {
  role: 'coach' | 'player';
  /** The route as asked for, e.g. `/golf/dashboard/messages`. */
  route: string;
  /** The state the capture shows, e.g. `inbox`, `thread`, `empty`. */
  state: string;
  width: number;
  /** A note that belongs with the capture (a NotRebuilt route, an empty state). */
  note?: string;
}

/**
 * Hides the Next dev server's own overlay (the "Rendering" chip and the issues badge). It is not app UI, it is absent
 * from a production build, and it sat on top of the Messages composer in the first captures. Call after each navigation.
 */
export async function hideDevOverlay(page: Page): Promise<void> {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
}

/** Saves a viewport screenshot and one log line for it; returns the facts it logged. */
export async function captureEvidence(page: Page, input: EvidenceInput) {
  const slug = `${input.route.replace(/^\/golf\/dashboard\/?/, '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'uuid') || 'home'}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
  const dir = join(EVIDENCE_DIR, input.role, String(input.width));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug}--${input.state}.png`);
  await hideDevOverlay(page);
  await page.screenshot({ path: file });
  const facts = await page.evaluate(() => {
    const root = document.documentElement;
    const h = document.querySelector('h1, h2');
    return {
      finalPath: location.pathname + location.search,
      clubhouse: !!document.querySelector('[data-ui="clubhouse"]'),
      heading: h?.textContent?.trim().slice(0, 80) ?? null,
      notRebuilt: /not (been )?(built|rebuilt)|isn.t (built|available) yet|coming/i.test(document.body.innerText.slice(0, 4000)),
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      dpr: window.devicePixelRatio,
    };
  });
  const record = {
    ...input,
    file: file.replace(`${process.cwd()}/`, ''),
    commit: head(),
    browser: page.context().browser()?.version() ?? 'unknown',
    viewport: page.viewportSize(),
    when: new Date().toISOString(),
    ...facts,
    sidewaysScroll: facts.scrollWidth > facts.clientWidth,
  };
  appendFileSync(join(EVIDENCE_DIR, 'captures.jsonl'), `${JSON.stringify(record)}\n`);
  return record;
}
