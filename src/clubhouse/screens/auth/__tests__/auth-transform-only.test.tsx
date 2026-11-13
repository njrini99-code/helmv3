import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/golf/login',
}));

/**
 * Owner, 2026-11-12: after Sign in "very clunky", the transitions "not smooth". In WebKit a clip-path transition repaints
 * the whole painted course on the main thread every frame, and the desk panel faded out long before its clip had opened,
 * so the frame's green showed as a slab where the form had been. The sign in's opening and the welcome's fold are now
 * transforms (the seam and the fold slab); these keep them that way.
 */
const root = join(__dirname, '..', '..', '..');
const css = readFileSync(join(root, 'styles', 'auth.css'), 'utf8');
const tokens = readFileSync(join(root, 'styles', 'auth-tokens.css'), 'utf8');
const src = (f: string) => readFileSync(join(root, 'screens', 'auth', f), 'utf8');

describe('auth transitions are transform and opacity only', () => {
  it('no rule in auth.css transitions clip-path', () => {
    const offenders = css.split('\n').filter((l) => /transition[^;]*clip-path/.test(l));
    expect(offenders).toEqual([]);
  });

  it('the desk window is the seam, not a clip on the photo', () => {
    const photo = (/\n\.ch-au-photo \{([^}]*)\}/.exec(css)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(photo).toMatch(/position: absolute/);
    expect(photo).not.toMatch(/clip-path/);
    expect(css).toMatch(/\.ch-au-seam \{\s*display: none;/);
    expect(css).toMatch(/width: calc\(var\(--ch-au-pw\) \+ 22px\)/);
  });

  it('opening, the panel and the seam slide as far as the course does, over the opening phase', () => {
    expect(css).toMatch(/\.ch-au\[data-phase='opening'\] :is\(\.ch-au-panel, \.ch-au-seam\) \{\s*transform: translateX\(calc\(var\(--ch-au-pw\) \+ 8px\)\);\s*transition: transform var\(--ch-au-t-photo\) var\(--ch-au-ease\);/);
    expect(css).toMatch(/\.ch-au\[data-phase='opening'\] \{\s*--ch-au-t-photo: var\(--ch-au-t-open\);/);
    // The panel stays opaque (fading it showed the seam through it); its words fade.
    expect(css).toMatch(/\.ch-au\[data-phase='opening'\] \.ch-au-panel \{\s*opacity: 1;/);
    expect(css).toMatch(/\.ch-au\[data-phase='opening'\] \.ch-au-panel > \* \{\s*opacity: 0;/);
    // 720ms is OPENING_MS; reduced motion and Animations off make it a millisecond.
    expect(tokens).toMatch(/--ch-au-t-open: 720ms;/);
    expect(tokens.match(/--ch-au-t-open: 1ms;/g)).toHaveLength(2);
  });

  it('the fold is the sidebar green sliding in, not a clip', () => {
    expect(css).toMatch(/\.ch-au-photo\[data-fold\] ~ \.ch-au-fold \{\s*transform: none;\s*transition: transform var\(--ch-au-t-fold\) var\(--ch-au-ease\);/);
    expect(css).not.toMatch(/\.ch-au-photo\[data-fold\] \{\s*\/\*[^*]*\*\/\s*clip-path/);
  });

  it('every frame that opens draws the seam between the photo and the panel, and the welcome draws the fold', () => {
    for (const f of ['SignIn.tsx', 'GateFrame.tsx']) {
      const s = src(f);
      const photo = s.indexOf('className="ch-au-photo"');
      const seam = s.indexOf('className="ch-au-seam"');
      const panel = s.indexOf('className="ch-au-panel"');
      expect(photo, f).toBeGreaterThan(-1);
      expect(seam, f).toBeGreaterThan(photo);
      expect(panel, f).toBeGreaterThan(seam);
    }
    const stage = src('WelcomeStage.tsx');
    expect(stage.indexOf('className="ch-au-fold"')).toBeGreaterThan(stage.indexOf('className="ch-au-photo"'));
  });
});

describe('Sign in is enabled on the first frame of a client navigation', () => {
  it('reads hydration from the shared store, not an effect', () => {
    const s = src('SignInForm.tsx');
    expect(s).toMatch(/const hydrated = useHydrated\(\);/);
    expect(s).not.toMatch(/setHydrated/);
  });

  it('is still disabled in the server HTML (#1245: no submit before hydration)', async () => {
    const { SignInForm } = await import('../SignInForm');
    const html = renderToString(<SignInForm onOpening={() => {}} />);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});
