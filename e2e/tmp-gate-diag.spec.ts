// TEMPORARY (remove before merge): prints, for each presentation gate finding, the element, its ancestors, their computed
// styles and the CSS rules that match them, so each cause is fixed from evidence rather than from reading home.css.
import { test, expect, type Page } from '@playwright/test';
import { GATE_SCREENS } from './clubhouse-gate/screens';
import { scanPage } from './clubhouse-gate/scan';

const out = (tag: string, data: unknown) => process.stdout.write(`DIAG|${tag}|${JSON.stringify(data)}\n`);

async function prep(page: Page, url: string, tap: string | undefined, phone: boolean) {
  const response = await page.goto(url, { waitUntil: 'load' }).catch(() => page.goto(url, { waitUntil: 'load' }));
  expect(response?.status(), `${url} did not render`).toBe(200);
  if (tap && phone) await page.locator(tap).first().click();
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; } *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }' });
  await page.evaluate(() => { document.documentElement.setAttribute('data-fw-theme', 'light'); });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-ui="clubhouse"]').first()).toBeVisible();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('.ch-root[data-hydrated]').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      if (a.timeline === document.timeline) {
        if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish();
      } else if (a.timeline) {
        a.effect?.updateTiming({ duration: 'auto' });
      }
    }
  });
}

function dump({ sel, max, depth, kids }: { sel: string; max: number; depth: number; kids: boolean }) {
  const PROPS = ['display', 'position', 'box-sizing', 'width', 'max-width', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom', 'margin-left', 'margin-right', 'border-left-width', 'border-top-width', 'border-top-style', 'border-top-color', 'border-radius', 'box-shadow', 'background-color', 'background-image', 'overflow-x', 'overflow-y', 'grid-template-columns', 'column-gap', 'transform', 'font-size', 'text-align', 'justify-content', 'align-items', 'flex-direction', 'container-type', 'white-space'];
  const RELEVANT = /^(padding|margin|border|background|box-shadow|grid|overflow|display|position|width|max-width|min-width|inset|transform|container|gap|column-gap|inline-size|justify|align|flex|text-align|font-size|--)/;
  type Rule = { sel: string; ctx: string; decl: string; rule: CSSStyleRule };
  const rules: Rule[] = [];
  const walk = (list: CSSRuleList, ctx: string) => {
    for (const r of Array.from(list)) {
      if (r instanceof CSSStyleRule) {
        const decl: string[] = [];
        for (let i = 0; i < r.style.length; i++) {
          const p = r.style.item(i);
          if (RELEVANT.test(p)) decl.push(`${p}:${r.style.getPropertyValue(p)}${r.style.getPropertyPriority(p) ? '!' : ''}`);
        }
        rules.push({ sel: r.selectorText, ctx, decl: decl.join('; ').slice(0, 600), rule: r });
        if (r.cssRules?.length) walk(r.cssRules, `${ctx} nest(${r.selectorText})`);
      } else if (r instanceof CSSMediaRule) walk(r.cssRules, `${ctx} @media ${r.conditionText}`);
      else if (r instanceof CSSSupportsRule) walk(r.cssRules, `${ctx} @supports ${r.conditionText}`);
      else if ((r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules, `${ctx} @${r.constructor.name} ${(r as unknown as { name?: string }).name ?? ''}`);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules, ''); } catch { /* cross-origin */ }
  }
  const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${Array.from(el.classList).map((c) => `.${c}`).join('')}`;
  const box = (el: Element) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10) / 10); };
  const info = (el: Element, withRules: boolean) => {
    const cs = getComputedStyle(el);
    const style: Record<string, string> = {};
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (v && !['none', 'normal', '0px', 'auto', 'static', 'visible', 'rgba(0, 0, 0, 0)', 'start', 'row', 'content-box'].includes(v)) style[p] = v;
    }
    const o: Record<string, unknown> = { el: name(el), box: box(el), style };
    if (el instanceof SVGElement) {
      const attrs: Record<string, string> = {};
      for (const a of Array.from(el.attributes)) if (a.name !== 'class') attrs[a.name] = a.value.slice(0, 80);
      o.attrs = attrs;
      const svg = (el as SVGGraphicsElement).ownerSVGElement;
      if (svg) o.svg = { viewBox: svg.getAttribute('viewBox'), box: box(svg), overflow: getComputedStyle(svg).overflow, aspect: svg.getAttribute('preserveAspectRatio') };
      try { const b = (el as SVGGraphicsElement).getBBox(); o.bbox = [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 10) / 10); } catch { /* not graphics */ }
    }
    if (withRules) {
      o.rules = rules.filter((r) => { try { return el.matches(r.sel); } catch { return false; } }).filter((r) => r.decl).slice(-30).map((r) => `${r.ctx.trim()} ${r.sel} { ${r.decl} }`.trim());
      const text = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (text) o.text = text.slice(0, 120);
    }
    return o;
  };
  return Array.from(document.querySelectorAll(sel)).slice(0, max).map((el) => {
    const chain: unknown[] = [];
    let p = el.parentElement;
    for (let i = 0; p && i < depth && p !== document.body; i++, p = p.parentElement) chain.push(info(p, i < 3));
    return {
      self: info(el, true),
      kids: kids ? Array.from(el.children).slice(0, 8).map((c) => ({ ...info(c, true), words: (c.textContent ?? '').trim().split(/\s+/).length, txt: (c.textContent ?? '').trim().slice(0, 80) })) : undefined,
      chain,
    };
  });
}

type Probe = { screen: string; phone: boolean; sels: string[]; kids?: boolean };
const PROBES: Probe[] = [
  { screen: 'team-long', phone: true, sels: ['svg.hudsvg g.hp circle.hit'] },
  { screen: 'home-coach', phone: true, sels: ['.ch-hm-sec--stat .ch-ph-nines.ch-scoreboard', 'section.ch-hm-sec > .ch-hm-sec__h > a.ch-hm-link'] },
  { screen: 'home-player', phone: true, sels: ['.ch-hm-sec--stat .ch-ph-nines.ch-scoreboard', '.ch-ph-game.is-phone'], kids: true },
  { screen: 'home-player', phone: true, sels: ['dl.ch-ph-figs'], kids: true },
  { screen: 'messages-empty', phone: true, sels: ['p.ch-es__body', '.ch-es'], kids: true },
  { screen: 'team-long', phone: false, sels: ['svg.hudsvg g.hp circle.hit'] },
  { screen: 'home-coach', phone: false, sels: ['ol.ch-h-days.ch-well'], kids: true },
  { screen: 'roster', phone: false, sels: ['button.ch-rs-sorth', '.ch-dt__head.ch-rs-row'], kids: true },
  { screen: 'read', phone: false, sels: ['div.ch-hl-ev', 'div.ch-hd-dx'], kids: true },
  { screen: 'stats-team', phone: false, sels: ['text.ch-shs-ax', 'circle.ch-shs-rdot'] },
];
const FAILING = new Set(['team-long', 'home-coach', 'home-coach-stress', 'home-player', 'messages-empty', 'roster', 'roster-long', 'read', 'read-stress', 'read-player', 'stats-team']);

test.skip('gate findings with their CSS', async ({ page }) => {
  const phone = page.viewportSize()!.width <= 820;
  for (const screen of GATE_SCREENS.filter((s) => FAILING.has(s.id) && (phone ? s.phone : s.desktop))) {
    await prep(page, screen.path, screen.tap, phone);
    const findings = (await page.evaluate(scanPage, { phone })).filter((f) => !['text-clip'].includes(f.check));
    out(`findings ${screen.id} ${phone ? 390 : 1440}`, findings);
    for (const probe of PROBES.filter((p) => p.screen === screen.id && p.phone === phone)) {
      for (const sel of probe.sels) out(`probe ${screen.id} ${phone ? 390 : 1440} ${sel}`, await page.evaluate(dump, { sel, max: phone ? 3 : 4, depth: 6, kids: !!probe.kids }));
    }
  }
});

test('messages-stress jump key timing', async ({ browser, browserName }) => {
  test.skip(browserName !== 'webkit', 'phone only');
  for (const reduced of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference', baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const w = window as unknown as { __diag: unknown[] };
      if (w.__diag) return;
      w.__diag = [];
      const t0 = performance.now();
      const seen = new WeakSet<Animation>();
      let last = '';
      const at = () => Math.round(performance.now() - t0);
      document.addEventListener('scroll', (e) => {
        const t = e.target as Element;
        if (t instanceof Element && t.matches('.ch-ms-scroll')) w.__diag.push({ at: at(), scroll: `${Math.round(t.scrollTop)}/${t.scrollHeight}/${t.clientHeight}` });
      }, { capture: true, passive: true });
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) document.addEventListener(type, () => w.__diag.push({ at: at(), input: type }), { capture: true, passive: true });
      const tick = () => {
        const hyd = !!document.querySelector('.ch-root[data-hydrated]');
        const scrollers = Array.from(document.querySelectorAll('.ch-ms-scroll')).map((s) => {
          const cs = getComputedStyle(s);
          const list = s.querySelector('.ch-ms-msgs');
          return `${Math.round(s.scrollTop)}/${s.scrollHeight}/${s.clientHeight} ov=${cs.overflowY} cls=${s.className} first=${s.firstElementChild?.className ?? '-'} msgs=${list?.children.length ?? '-'} listAnims=${list?.getAnimations?.().length ?? '-'} listT=${list ? getComputedStyle(list).transform : '-'}`;
        });
        const key = !!document.querySelector('.ch-msv-jump');
        const push = Array.from(document.querySelectorAll('section.ch-pscreen')).map((s) => `${s.className}@${Math.round(s.getBoundingClientRect().left)} vis=${getComputedStyle(s).visibility}`);
        const state = JSON.stringify({ hyd, scrollers, key, push });
        if (state !== last) { w.__diag.push({ at: at(), state }); last = state; }
        for (const a of document.getAnimations()) {
          if (seen.has(a)) continue;
          seen.add(a);
          const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
          if (!t || !(t.matches('.ch-msv-jump, section.ch-pscreen, .ch-ms-msgs, .ch-ms-scroll'))) continue;
          let frames: unknown[] = [];
          try { frames = (a.effect as KeyframeEffect).getKeyframes(); } catch { /* */ }
          w.__diag.push({ at: at(), anim: t.className, dur: (a.effect as KeyframeEffect).getComputedTiming().duration, frames });
        }
        if (at() < 12000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const response = await page.goto('/clubhouse-preview/messages?state=design&view=stress', { waitUntil: 'load' });
    expect(response?.status()).toBe(200);
    const loadedAt = await page.evaluate(() => Math.round(performance.now()));
    await page.locator('.ch-root[data-hydrated]').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
    const hydAt = await page.evaluate(() => Math.round(performance.now()));
    await page.waitForTimeout(2500);
    const gateEnd = await page.evaluate(() => Math.round(performance.now()));
    await page.waitForTimeout(4000);
    out(`jump ${reduced ? 'reduce' : 'motion'} load=${loadedAt} hyd=${hydAt} gateEnd=${gateEnd}`, await page.evaluate(() => (window as unknown as { __diag: unknown[] }).__diag.slice(0, 400)));
    await context.close();
  }
});
