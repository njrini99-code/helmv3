import { expect, test, type Page } from '@playwright/test';

/**
 * Messages 11g (design-refresh/messages 07 and 08, MSG-MOT-06 to 08): the 11 interrupt cases on the preview fixture, sampled
 * every animation frame and judged by the design page's `MC.judge`. A case fails on a teleport (a one-frame speed spike), a
 * flicker (gone for a frame, or a blink in opacity) or, under Reduce Motion, on anything gliding.
 *
 * MSG-MOT-07: a run counts only in a headed browser at 60 Hz or better, because a loaded headless browser drops frames.
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse-messages-motion.spec.ts --project=chromium --headed
 *
 * Tracked elements are found by the lane's own classes rather than the `data-mc` hooks 08 names: the classes are already
 * unique to each moving thing, and nothing is added to the DOM for a test.
 */
test.skip(!process.env.PLAYWRIGHT_BASE_URL?.includes('localhost'), 'The preview routes run against a local dev server');

const THREAD = '/clubhouse-preview/messages?state=design&view=thread';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** A tracked element: the newest match of `sel` holding `text`, so a later arrival never swaps what is being judged. */
type Targets = Record<string, { sel: string; text?: string }>;

/** Installs the sampler: `__mcStart(targets, ms)` records each target's box and effective opacity each frame. */
async function installSampler(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __mcStart: (t: Record<string, { sel: string; text?: string }>, ms: number) => Promise<unknown> }).__mcStart = async (targets, ms) => {
      const names = Object.keys(targets);
      const rows: Array<{ t: number; v: Array<{ x: number; y: number; w: number; h: number; o: number } | null> }> = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        rows.push({
          t: now,
          v: names.map((name) => {
            const { sel, text } = targets[name]!;
            const list = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => !text || e.textContent?.includes(text));
            const n = list[list.length - 1];
            if (!n || !n.isConnected) return null;
            const r = n.getBoundingClientRect();
            let o = 1;
            for (let x: HTMLElement | null = n; x; x = x.parentElement) {
              const c = getComputedStyle(x);
              if (c.display === 'none' || c.visibility === 'hidden') {
                o = 0;
                break;
              }
              o *= Number(c.opacity);
            }
            return { x: r.left, y: r.top, w: r.width, h: r.height, o };
          }),
        });
      }
      return { names, rows };
    };
  });
}

type Sampled = { names: string[]; rows: Array<{ t: number; v: Array<{ x: number; y: number; w: number; h: number; o: number } | null> }> };

/** The design page's `MC.judge` (prototype.js line 1792), per tracked element. */
function judge({ names, rows }: Sampled, still: boolean) {
  return names.map((name, k) => {
    const seq = rows.map((r) => ({ t: r.t, p: r.v[k] ?? null }));
    const speeds: Array<{ d: number; v: number; o: number } | null> = [];
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1]!.p;
      const b = seq[i]!.p;
      const dt = Math.max(1, seq[i]!.t - seq[i - 1]!.t);
      if (!a || !b) {
        speeds.push(null);
        continue;
      }
      const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.w - a.w), Math.abs(b.h - a.h));
      speeds.push({ d, v: d / dt, o: Math.abs(b.o - a.o) });
    }
    let spikes = 0;
    let blinks = 0;
    let gaps = 0;
    let glides = 0;
    speeds.forEach((c, i) => {
      if (!c) return;
      const near = [speeds[i - 1], speeds[i + 1]].filter(Boolean) as Array<{ d: number; v: number; o: number }>;
      const nv = near.length ? Math.max(...near.map((x) => x.v)) : 0;
      const no = near.length ? Math.max(...near.map((x) => x.o)) : 0;
      if (c.d > 10 && c.v > 3 * Math.max(nv, 0.05)) spikes++;
      if (c.o > 0.45 && c.o > 3 * Math.max(no, 0.02)) blinks++;
    });
    for (let i = 1; i < seq.length - 1; i++) if (seq[i - 1]!.p && !seq[i]!.p && seq.slice(i + 1).some((x) => x.p)) gaps++;
    for (let i = 1; i < speeds.length; i++) if (speeds[i] && speeds[i - 1] && speeds[i]!.d > 0.5 && speeds[i - 1]!.d > 0.5) glides++;
    const ok = still ? !glides && !gaps : !spikes && !gaps && !blinks;
    const seen = seq.some((x) => x.p);
    return { name, ok, seen, spikes, blinks, gaps, glides };
  });
}

async function run(page: Page, targets: Targets, ms: number, act: () => Promise<void>, still = false) {
  const sampling = page.evaluate(([t, m]) => (window as unknown as { __mcStart: (a: unknown, b: unknown) => Promise<Sampled> }).__mcStart(t, m), [targets, ms] as const);
  await act();
  const verdict = judge(await sampling, still);
  expect(verdict.filter((v) => !v.seen).map((v) => v.name), 'every tracked element was on screen').toEqual([]);
  expect(verdict.filter((v) => !v.ok)).toEqual([]);
}

const composer = (page: Page) => page.locator('.ch-ms-comp textarea').last();
async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await page.locator('.ch-ms-send').click();
}
const reply = (page: Page, text: string, typingMs: number) =>
  page.evaluate(
    ([t, ms]) => {
      const f = (window as unknown as { __chMsgFixture: { typing: (on: boolean) => void; incoming: (s: string) => void } }).__chMsgFixture;
      f.typing(true);
      window.setTimeout(() => {
        f.typing(false);
        f.incoming(t as string);
      }, ms as number);
    },
    [text, typingMs] as const,
  );
const bubble = '.ch-ms-msg .ch-ms-bub';
const olderText = async (page: Page) => ((await page.locator(bubble).last().textContent()) ?? '').trim().slice(0, 24);

async function hold(page: Page) {
  const last = page.locator(bubble).last();
  const box = (await last.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
}

test.describe('phone', () => {
  test.use({ viewport: PHONE });
  test.beforeEach(async ({ page }) => {
    await installSampler(page);
    await page.goto(THREAD, { waitUntil: 'networkidle' });
    await page.locator(bubble).first().waitFor();
  });

  test('1. Send twice, 140 ms apart', async ({ page }) => {
    const older = await olderText(page);
    await run(page, { 'older message': { sel: bubble, text: older }, 'first bubble': { sel: bubble, text: 'Range at 3' }, 'second bubble': { sel: bubble, text: 'Bring the alignment sticks' } }, 2400, async () => {
      await send(page, 'Range at 3');
      await page.waitForTimeout(140);
      await send(page, 'Bring the alignment sticks');
    });
  });

  test('2. A reply lands while yours is still rising', async ({ page }) => {
    const older = await olderText(page);
    await run(page, { 'older message': { sel: bubble, text: older }, 'your bubble': { sel: bubble, text: 'See you at 3' } }, 2000, async () => {
      await send(page, 'See you at 3');
      await page.waitForTimeout(120);
      await reply(page, 'On my way', 220);
    });
  });

  test('3. Hold, then let go mid-lift', async ({ page }) => {
    await run(page, { 'held bubble': { sel: `${bubble}, .ch-msv-lift__copy` } }, 1100, async () => {
      await hold(page);
      await page.waitForTimeout(90);
      await page.keyboard.press('Escape');
    });
  });

  test('4. Hold again while it settles', async ({ page }) => {
    await run(page, { 'held bubble': { sel: `${bubble}, .ch-msv-lift__copy` } }, 1800, async () => {
      await hold(page);
      await page.waitForTimeout(420);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(70);
      await hold(page);
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
    });
  });

  test('6. Attach: close and reopen fast', async ({ page }) => {
    const key = (await page.locator('.ch-msv-plus__key').boundingBox())!;
    // Real pointer events at the key's place: an open menu sits over the page, and a tap there still goes where it lands.
    const tap = () => page.mouse.click(key.x + key.width / 2, key.y + key.height / 2);
    await run(page, { 'plus key': { sel: '.ch-msv-plus__key' } }, 900, async () => {
      await tap();
      await page.waitForTimeout(110);
      await tap();
      await page.waitForTimeout(60);
      await tap();
    });
  });
});

test.describe('phone, the team thread', () => {
  test.use({ viewport: PHONE });
  test.beforeEach(async ({ page }) => {
    await installSampler(page);
    await page.goto('/clubhouse-preview/messages?state=design', { waitUntil: 'networkidle' });
    await page.locator('.ch-ms-row .ch-ms-row__main').first().click();
    await page.locator('.ch-ms-poll__opt').first().waitFor();
  });

  test('5. Votes sheet: close mid-rise, reopen', async ({ page }) => {
    const link = page.locator('.ch-ms-poll__link').last();
    await link.scrollIntoViewIfNeeded();
    const box = (await link.boundingBox())!;
    const open = () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await run(page, { sheet: { sel: 'dialog[open] .ch-modal__panel' } }, 1500, async () => {
      await open();
      await page.waitForTimeout(160);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(110);
      await open();
      await page.waitForTimeout(700);
      await page.keyboard.press('Escape');
    });
  });

  test('8. Vote, then change it 100 ms later', async ({ page }) => {
    const poll = page.locator('.ch-ms-poll__opts').last();
    await poll.scrollIntoViewIfNeeded();
    const opts = poll.locator('.ch-ms-poll__opt');
    await run(page, { 'choice fills': { sel: '.ch-ms-poll__fill' } }, 1100, async () => {
      await opts.nth(0).click();
      await page.waitForTimeout(100);
      await opts.nth(1).click();
    });
  });

  test('9. Jump key: away and back quickly', async ({ page }) => {
    const away = () =>
      page.evaluate(() => {
        const el = document.querySelector('.ch-msp-scroll') as HTMLElement | null;
        if (el) el.scrollTop = 0;
      });
    // The key shows past 90% of a screen from the end, so the thread is made long enough first (the fixture adds to Eli's).
    await page.goto(THREAD, { waitUntil: 'networkidle' });
    await page.locator(bubble).first().waitFor();
    await page.evaluate(() => {
      const f = (window as unknown as { __chMsgFixture: { incoming: (s: string) => void } }).__chMsgFixture;
      for (let i = 0; i < 14; i++) f.incoming(`Filler ${i}`);
    });
    await page.waitForTimeout(1200);
    await away();
    const jump = page.locator('.ch-msv-jump');
    await jump.waitFor();
    await run(page, { 'jump key': { sel: '.ch-msv-jump' } }, 900, async () => {
      await jump.click();
      await page.waitForTimeout(90);
      await away();
    });
  });
});

test.describe('phone, from the inbox', () => {
  test.use({ viewport: PHONE });
  test('7. Back pressed mid-push', async ({ page }) => {
    await installSampler(page);
    await page.goto('/clubhouse-preview/messages?state=design', { waitUntil: 'networkidle' });
    const row = page.locator('.ch-ms-row').filter({ hasText: 'Eli' }).first();
    await row.waitFor();
    await run(page, { 'conversation list': { sel: '.ch-msp-inbox' } }, 1200, async () => {
      await row.click();
      await page.waitForTimeout(170);
      await page.getByRole('button', { name: 'Back to Messages' }).click();
    });
  });
});

test.describe('phone, Reduce Motion', () => {
  test.use({ viewport: PHONE, reducedMotion: 'reduce' });
  test('11. Reduce Motion: send and a reply', async ({ page }) => {
    await installSampler(page);
    await page.goto(THREAD, { waitUntil: 'networkidle' });
    await page.locator(bubble).first().waitFor();
    await run(
      page,
      { 'your bubble': { sel: bubble, text: 'Calm' } },
      1400,
      async () => {
        await send(page, 'Calm');
        await page.waitForTimeout(80);
        await reply(page, 'Calm too', 200);
      },
      true,
    );
  });
});

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });
  test('10. Desktop details: close mid-open, reopen', async ({ page }) => {
    await installSampler(page);
    await page.goto(THREAD, { waitUntil: 'networkidle' });
    await page.locator(bubble).first().waitFor();
    const details = page.getByRole('button', { name: 'Details', exact: true });
    await run(page, { composer: { sel: '.ch-ms-comp' }, 'latest message': { sel: bubble } }, 1500, async () => {
      await details.click();
      await page.waitForTimeout(150);
      await details.click();
      await page.waitForTimeout(120);
      await details.click();
      await page.waitForTimeout(600);
      await details.click();
    });
  });
});
