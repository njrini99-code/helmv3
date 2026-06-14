import type { Config } from "tailwindcss";
import * as tailwindcssAnimateNS from "tailwindcss-animate";

/**
 * Interop-safe resolution of `tailwindcss-animate`.
 *
 * `tailwindcss-animate` is CommonJS (`module.exports = { handler, config }`).
 * Depending on which loader resolves this config (Node ESM vs Next's build-time
 * TS→CJS transpile, which applies `__esModule`-style default interop), the
 * default binding can come back as `undefined`, leaving a hole in `plugins: []`
 * that crashes Tailwind's `resolveConfig` (`Cannot read properties of undefined
 * (reading '__isOptionsFunction')`) — and that crash takes down EVERY CSS file,
 * including `globals.css` and any `*.module.css`. Normalizing across the
 * possible interop shapes (namespace object, `.default`, or the bare plugin)
 * makes the config load identically under every loader.
 */
const tailwindcssAnimate =
  (tailwindcssAnimateNS as { default?: unknown }).default ?? tailwindcssAnimateNS;

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // ═══════════════════════════════════════════════════════════════
        // FAIRWAY DESIGN SYSTEM — token-backed utilities (ADDITIVE / FOUNDATION)
        // ---------------------------------------------------------------
        // Maps the locked warm OKLCH token set (src/styles/design-tokens.css,
        // ui-intelligence/DESIGN-SYSTEM.md §1) onto Tailwind utilities for the
        // redesign. ALL names here are NEW and do not collide with any existing
        // utility above. The three colliding status names (success/warning/
        // danger already exist as flat hex below) are namespaced `fw-*` so the
        // current app's `bg-success` / `text-danger` etc. are untouched.
        // Resolve to the --fw-color-* CSS variables, so they only render where a
        // Fairway component opts in. The current app's appearance is unchanged.
        // ═══════════════════════════════════════════════════════════════
        canvas:       'var(--fw-color-canvas)',
        surface:      'var(--fw-color-surface)',
        'surface-tint':   'var(--fw-color-surface-tint)',   // = spec "surface-warm"
        'surface-sunken': 'var(--fw-color-surface-sunken)',
        inset:        'var(--fw-color-surface-sunken)',      // alias — nested wells
        elevated:     'var(--fw-color-elevated)',
        accent: {
          50:  'var(--fw-color-accent-50)',
          100: 'var(--fw-color-accent-100)',
          200: 'var(--fw-color-accent-200)',
          300: 'var(--fw-color-accent-300)',
          400: 'var(--fw-color-accent-400)',
          500: 'var(--fw-color-accent-500)',
          600: 'var(--fw-color-accent-600)',
          700: 'var(--fw-color-accent-700)',
          800: 'var(--fw-color-accent-800)',
          900: 'var(--fw-color-accent-900)',
          DEFAULT: 'var(--fw-color-accent-500)',
        },
        'text-primary':   'var(--fw-color-text-primary)',
        'text-secondary': 'var(--fw-color-text-secondary)',
        'text-tertiary':  'var(--fw-color-text-tertiary)',
        'text-on-accent': 'var(--fw-color-text-on-accent)',
        'text-on-dark':   'var(--fw-color-text-on-dark)',
        'border-subtle':  'var(--fw-color-border-subtle)',
        'border-strong':  'var(--fw-color-border-strong)',
        'border-focus':   'var(--fw-color-border-focus)',
        // Status — namespaced `fw-*` (existing success/warning/danger kept as-is)
        'fw-success':     'var(--fw-color-success)',
        'fw-success-bg':  'var(--fw-color-success-bg)',
        'fw-warning':     'var(--fw-color-warning)',
        'fw-warning-bg':  'var(--fw-color-warning-bg)',
        'fw-danger':      'var(--fw-color-danger)',
        'fw-danger-bg':   'var(--fw-color-danger-bg)',
        // Dark chrome (sidebar) aliases
        'nav-bg':       'var(--fw-color-nav-bg)',
        'nav-surface':  'var(--fw-color-nav-surface)',
        'nav-text':     'var(--fw-color-nav-text)',
        'nav-text-dim': 'var(--fw-color-nav-text-dim)',
        'nav-accent':   'var(--fw-color-nav-accent)',

        // W0 token unification (2026-05-28): `helm-green-*` and
        // `helm-amber-*` OKLCH scales were deleted. The single canonical
        // brand green lives under `primary-*` below (sourced from
        // src/styles/tokens.css `--color-primary-*`). Wave 1 sweeps
        // consumer code from `helm-green-*` onto `primary-*`.
        // PRIMARY BRAND COLORS
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16A34A',  // PRIMARY BRAND COLOR — matches Helm logo green
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },

        // WARM NEUTRALS (stone/warm tones - NOT cool grays)
        warm: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },

        // CREAM / LINEN BACKGROUND
        // Updated per Apr 2026 California-modern brief: base shifts from
        // pure off-white (#FFFEFA) toward a warmer "linen" #F7F5F2 — the
        // California-modern off-white. The 50/100/200/300 scale stays so
        // existing classnames continue to read warm but slightly more
        // nuanced. Add cream-500 (the linen base) so we can target it
        // explicitly for matte surfaces.
        cream: {
          DEFAULT: '#F7F5F2',
          50: '#FBFAF7',      // Lightest — for inset highlights
          100: '#F7F5F2',     // California linen — primary page backdrop
          200: '#F0EBE3',     // Tab backgrounds, soft separators
          300: '#E5DFD3',     // Warm divider tone, table-row alternation
          400: '#CFC8B8',     // Sand inset, subtle borders
        },

        // W0 token unification (2026-05-28): `sage-*` scale deleted.
        // The brief's "muted accent" need is served by the cream-300/400
        // tier + a hint of primary-700; sage-as-its-own-scale created
        // ambiguity with primary. Wave 1 sweeps consumer code.

        // SEMANTIC COLORS — canonical (synthesis §5)
        // Sourced from src/styles/tokens.css.
        success: '#16A34A',  // Same as primary-600 (brand)
        warning: '#F59E0B',  // amber — replaces SF Orange #FF9500
        danger: '#FF3B30',   // SF Red — same as destructive
        destructive: '#FF3B30',
        info: '#0EA5E9',     // sky-500 — replaces SF Blue #007AFF

        // Data viz reference colors (synthesis §5)
        // pgaTour utility ("text-pgaTour", "bg-pgaTour") is the canonical
        // way to color the PGA Tour reference line in player charts.
        // Mirrors --color-pga-tour in tokens.css.
        pgaTour: '#A7A29A',

        // ═══════════════════════════════════════════════════════════════
        // iOS SYSTEM COLORS — narrowed in W0.
        // Deleted: sf-red, sf-orange, sf-green, sf-blue (replaced by
        // destructive / warning / primary / info above). The remaining
        // sf-* aliases are kept for surfaces that need iOS-native tints
        // (e.g. mobile system status icons); Wave 1 may sweep further.
        // ═══════════════════════════════════════════════════════════════
        'sf-yellow': '#FFCC00',
        'sf-mint': '#00C7BE',
        'sf-teal': '#30B0C7',
        'sf-cyan': '#32ADE6',
        'sf-indigo': '#5856D6',
        'sf-purple': '#AF52DE',
        'sf-pink': '#FF2D55',

        // GLASS EFFECTS - Standardized System
        // California-modern matte surfaces (Apr 2026 brief pivot): tints
        // derive from cream-100 (#F7F5F2 → 247, 245, 242) so every glass
        // surface picks up the linen base instead of pure white. These
        // values mirror --glass-*-bg / --glass-*-border in globals.css
        // so `bg-glass` (Tailwind utility) and `.glass-standard` (CSS
        // utility) render the same warm cream surface — fixing the
        // gray-card disconnect where the Tailwind utility was emitting
        // pure-white-over-cream and reading as a washed-out gray.
        // Borders use cream-400 (#CFC8B8) so the edge feels like sand
        // inset rather than a white hairline.
        // Use with backdrop-blur-glass, backdrop-blur-glass-subtle, or backdrop-blur-glass-prominent
        glass: {
          // Background opacities (cream-100 derived)
          subtle: 'rgba(247, 245, 242, 0.62)',      // Large surfaces, filters
          DEFAULT: 'rgba(247, 245, 242, 0.78)',     // Standard cards, panels
          prominent: 'rgba(251, 250, 247, 0.92)',   // Nav, modals (cream-50 derived)
          // Legacy aliases (backward compat) — point at the warm cream
          // surfaces so older callers also pick up the pivot.
          white: 'rgba(247, 245, 242, 0.78)',
          'white-strong': 'rgba(251, 250, 247, 0.92)',
          medium: 'rgba(247, 245, 242, 0.55)',
          // Borders (cream-400 derived — sand inset, not white hairline)
          border: 'rgba(207, 200, 184, 0.40)',         // Subtle border
          'border-strong': 'rgba(207, 200, 184, 0.45)', // Standard border
          'border-prominent': 'rgba(207, 200, 184, 0.55)', // Prominent border
          // Dark glass (unchanged — used for dark surfaces only)
          dark: 'rgba(28, 25, 23, 0.97)',
          // Input fields — kept slightly whiter so form chrome reads
          // distinct from card surfaces, but still warm-tinted.
          input: 'rgba(251, 250, 247, 0.85)',
        },

        // ═══════════════════════════════════════════════════════════════
        // LEGACY COLORS - Keep for backward compatibility
        // These reference CSS variables defined in globals.css
        // ═══════════════════════════════════════════════════════════════
        'warm-cream': 'rgb(var(--warm-cream) / <alpha-value>)',
        'warm-stone': 'rgb(var(--warm-stone) / <alpha-value>)',
        'golden': {
          50: 'rgb(var(--golden-50) / <alpha-value>)',
          100: 'rgb(var(--golden-100) / <alpha-value>)',
          200: 'rgb(var(--golden-200) / <alpha-value>)',
          400: 'rgb(var(--golden-400) / <alpha-value>)',
          500: 'rgb(var(--golden-500) / <alpha-value>)',
          600: 'rgb(var(--golden-600) / <alpha-value>)',
          700: 'rgb(var(--golden-700) / <alpha-value>)',
        },
        // W0 token unification (2026-05-28): `field` and `fairway`
        // (deeper greens used in landing-page hero) deleted. Wave 1
        // sweeps consumer code onto primary-700 / primary-800.
        border: {
          light: '#ECEAE6',
          DEFAULT: '#E0DED9',
          dark: '#D4D1CC'
        },
      },
      fontFamily: {
        // Geist Sans is Vercel's display-light grotesque — sub-pixel
        // optical sizing + range from weight 100 to 900 lets the
        // California-modern × neo-futurism brief breathe at every
        // scale. Fraunces stays available as the editorial serif
        // companion for eyebrows and quotes (used sparingly).
        sans: ['var(--font-geist-sans)', 'DM Sans', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        // Wave 6 will use Fraunces for editorial accents (one italicized
        // hero word, eyebrows, pull quotes). `--font-fraunces` is loaded
        // by next/font in src/app/layout.tsx; `--font-serif` is the
        // legacy alias kept for backward-compat.
        serif: ['var(--font-fraunces)', 'var(--font-serif)', 'Playfair Display', 'Georgia', 'serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['var(--font-geist-sans)', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        // ── Fairway design-system type roles (ADDITIVE) ──
        // Distinct names (`font-fw-*`) so they never override the active
        // `font-sans` / `font-display` / `font-mono` utilities above. Mirror
        // the --fw-font-* vars in src/styles/design-tokens.css. Loaded by
        // next/font in src/app/layout.tsx (Fraunces variable / General Sans
        // local / Fragment Mono). Only opted-in Fairway components use these.
        // Apple system sans (SF Pro on Apple devices) — no serif. The headline
        // (`fw-display`) + body (`fw-sans`) both ride the system stack so the UI
        // reads like a native Apple app; numbers stay on Fragment Mono (`fw-mono`).
        'fw-display': ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Helvetica Neue"', '"Segoe UI"', 'Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'fw-sans':    ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Helvetica Neue"', '"Segoe UI"', 'Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'fw-mono':    ['var(--font-fairway-mono)', 'ui-monospace', '"SF Mono"', 'monospace'],
      },
      fontSize: {
        // ═══════════════════════════════════════════════════════════════
        // CANONICAL 9-STEP TYPE SCALE (W0 — synthesis §5)
        // -------------------------------------------------------------
        // Replaces ~24 ad-hoc fontSize tokens + 1,540 `text-[Npx]`
        // arbitrary overrides. Wave 1 sweeps consumer code to these
        // utilities. Mirrors --text-{display,h1,h2,h3,body-lg,body,
        // body-sm,caption,eyebrow}-* in src/styles/tokens.css.
        // ═══════════════════════════════════════════════════════════════
        'display':   ['40px', { lineHeight: '48px', letterSpacing: '-0.03em', fontWeight: '600' }],
        'h1':        ['32px', { lineHeight: '40px', letterSpacing: '-0.022em', fontWeight: '600' }],
        'h2':        ['24px', { lineHeight: '32px', letterSpacing: '-0.018em', fontWeight: '600' }],
        'h3':        ['18px', { lineHeight: '26px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'body-lg':   ['17px', { lineHeight: '26px', fontWeight: '400' }],
        'body':      ['15px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm':   ['13px', { lineHeight: '20px', fontWeight: '400' }],
        'caption':   ['12px', { lineHeight: '18px', letterSpacing: '0.006em', fontWeight: '500' }],
        'eyebrow':   ['11px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '600' }],

        // ═══════════════════════════════════════════════════════════════
        // iOS TYPE SCALE — Apple HIG (San Francisco)
        // Use these on mobile/native surfaces for authentic iOS feel
        // ═══════════════════════════════════════════════════════════════
        'large-title': ['34px', { lineHeight: '1.1', letterSpacing: '-0.022em', fontWeight: '700' }],
        'title-1':     ['28px', { lineHeight: '1.15', letterSpacing: '-0.02em',  fontWeight: '700' }],
        'title-2':     ['22px', { lineHeight: '1.2',  letterSpacing: '-0.018em', fontWeight: '700' }],
        'title-3':     ['20px', { lineHeight: '1.2',  letterSpacing: '-0.015em', fontWeight: '600' }],
        'headline':    ['17px', { lineHeight: '1.25', letterSpacing: '-0.01em',  fontWeight: '600' }],
        // iOS `body` (17px) merged with canonical `body-lg` above — text-body
        // now resolves to the canonical 15px scale. Use `text-body-lg` for the
        // old iOS body. (W0 token unification)
        'callout':     ['16px', { lineHeight: '1.3',  letterSpacing: '-0.01em',  fontWeight: '400' }],
        'subhead':     ['15px', { lineHeight: '1.35', letterSpacing: '-0.006em', fontWeight: '400' }],
        'footnote':    ['13px', { lineHeight: '1.4',  letterSpacing: '0.004em',  fontWeight: '400' }],
        'caption-1':   ['12px', { lineHeight: '1.4',  letterSpacing: '0.006em',  fontWeight: '400' }],
        'caption-2':   ['11px', { lineHeight: '1.4',  letterSpacing: '0.01em',   fontWeight: '400' }],

        'micro': ['10px', { lineHeight: '14px' }],  // Badges, annotations
        'label': ['11px', { lineHeight: '16px' }],   // Form labels, captions
        'xs': '12px',
        'sm': '14px',
        'base': '16px',      // Body text
        'lg': '18px',
        'xl': '20px',
        // W0: legacy `h1/h2/h3/display` simple sizes (24/28/30/36) deleted —
        // the canonical scale at the top of this fontSize block now owns
        // those utility names with synthesis §5 values (32/24/18/40).
        // Legacy sizes for backward compatibility
        '2xs': '11px',
        '2xl': '24px',
        '3xl': '30px',
        '4xl': '36px',
        '5xl': '48px',
        '6xl': '60px',
        '7xl': '72px',
        'display-sm': ['48px', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
        'display-lg': ['72px', { lineHeight: '1', letterSpacing: '-0.03em' }],
        'display-xl': ['6rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['3.5rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      letterSpacing: {
        tightest: '-0.03em',
        tighter: '-0.025em',
        tight: '-0.02em',
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',    // Card padding (p-8)
        '10': '40px',
        '12': '48px',
        '16': '64px',
        // Legacy spacing
        '18': '4.5rem',   // 72px
        '22': '5.5rem',   // 88px
      },
      borderRadius: {
        // CANONICAL radius scale (W0 — synthesis §5). Mirrors --radius-*
        // in src/styles/tokens.css. Wave 0 reconciled the prior conflict
        // between tokens.css (10/12/16/20) and globals.css (12/16/24/32).
        // `rounded-lg` shifted from 14 → 12 to match canonical.
        'sm':   '6px',      // tags, chips
        'md':   '10px',     // buttons, inputs
        'lg':   '12px',     // small cards (CANONICAL — was 14px)
        'xl':   '16px',     // cards (CANONICAL — not 20px, not 24px)
        '2xl':  '20px',     // modals
        '3xl':  '24px',     // hero plinths only
        'full': '9999px',
        // ── Fairway design-system radii (ADDITIVE — token-backed) ──
        // `card` (= 20px, THE Fairway card radius) is a new name; the rest are
        // `fw-*` so they never clash with the canonical scale above.
        'card':   'var(--fw-radius-card)',  // 20px — THE Fairway card radius
        'fw-sm':  'var(--fw-radius-sm)',    // 10px — inputs, chips
        'fw-md':  'var(--fw-radius-md)',    // 14px — list rows, insets
        'fw-lg':  'var(--fw-radius-lg)',    // 28px — modals, sheets, hero plinths
      },
      zIndex: {
        // CANONICAL z-index tier (W0 — synthesis §5: replaces 17 ad-hoc
        // z-[N] values). Mirrors --z-* in src/styles/tokens.css.
        'base':    '0',
        'raised':  '10',
        'overlay': '20',
        'modal':   '30',
        'toast':   '40',
        'toolbar': '50',
        'tooltip': '60',
      },
      boxShadow: {
        // ═══════════════════════════════════════════════════════════════
        // CORE ELEVATION SYSTEM - Use these for standard elevation
        // ═══════════════════════════════════════════════════════════════
        'sm': '0 1px 2px rgba(0,0,0,0.04)',                // Subtle elevation
        'DEFAULT': '0 1px 3px rgba(0,0,0,0.08)',           // Base elevation
        'md': '0 4px 8px rgba(0,0,0,0.06)',                // Medium elevation
        'lg': '0 12px 24px rgba(0,0,0,0.08)',              // Large elevation
        'xl': '0 20px 40px rgba(0,0,0,0.1)',               // Extra large
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.15)',    // Maximum elevation

        // ═══════════════════════════════════════════════════════════════
        // GLASS SHADOW SYSTEM - Use with glass backgrounds
        // ═══════════════════════════════════════════════════════════════
        'glass': '0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glass-hover': '0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
        'glass-sm': '0 1px 2px rgba(0,0,0,0.02), 0 2px 4px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glass-lg': '0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',

        // ═══════════════════════════════════════════════════════════════
        // INTERACTIVE SHADOWS - Cards, buttons, focus states
        // ═══════════════════════════════════════════════════════════════
        'card': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.1)',
        'focus': '0 0 0 3px rgba(22, 163, 74, 0.1)',       // Accessibility focus ring
        'focus-ring': '0 0 0 3px rgba(22, 163, 74, 0.1)',  // Alias for focus

        // ═══════════════════════════════════════════════════════════════
        // GLOW EFFECTS - Use sparingly for emphasis
        // ═══════════════════════════════════════════════════════════════
        'glow-green': '0 0 20px rgba(22, 163, 74, 0.3)',
        'glow-green-lg': '0 0 40px rgba(22, 163, 74, 0.4)',

        // ═══════════════════════════════════════════════════════════════
        // LEGACY ALIASES - Backward compatibility (prefer canonical names)
        // ═══════════════════════════════════════════════════════════════
        'xs': '0 1px 2px rgba(0,0,0,0.04)',               // Use 'sm' instead
        'subtle': '0 1px 2px rgba(0,0,0,0.04)',           // Use 'sm' instead
        'inner-highlight': 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'elevation-1': '0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
        'elevation-2': '0 4px 8px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.03)',
        'elevation-3': '0 8px 16px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.04)',
        'elevation-4': '0 16px 32px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.06)',
        'glass-md': '0 1px 2px rgba(0,0,0,0.02), 0 4px 8px rgba(0,0,0,0.02), 0 8px 16px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glass-xl': '0 4px 8px rgba(0,0,0,0.02), 0 12px 24px rgba(0,0,0,0.04), 0 24px 48px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
        'glow-amber': '0 0 30px rgba(217,119,6,0.15)',
        'glow-emerald': '0 0 30px rgba(16,185,129,0.15)',
        'glow-green-intense': '0 0 60px rgba(22, 163, 74, 0.5)',

        // ═══════════════════════════════════════════════════════════════
        // FAIRWAY DESIGN SYSTEM — warm-tinted elevation (ADDITIVE / FOUNDATION)
        // ---------------------------------------------------------------
        // Soft, layered, warm-tinted (hue ~60) — afternoon light, never pure
        // black (src/styles/design-tokens.css). `flat`/`soft`/`raise`/`pop`
        // are new names; `fw-glass`/`fw-modal`/`fw-glow-accent` are namespaced
        // because plain `glass` already exists above. The current app's
        // `shadow-glass` / `shadow-card` etc. are untouched.
        // ═══════════════════════════════════════════════════════════════
        'flat':          'var(--fw-shadow-flat)',
        'soft':          'var(--fw-shadow-soft)',   // hover / raised cards
        'raise':         'var(--fw-shadow-raise)',  // popovers / floating glass (spec "lift")
        'pop':           'var(--fw-shadow-pop)',    // anchored panels
        'fw-modal':      'var(--fw-shadow-modal)',  // sheets / modals
        'fw-glow-accent':'var(--fw-glow-accent)',   // accent emphasis ring
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'mesh': 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%2316a34a\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.3))',
        'shimmer': 'linear-gradient(90deg, transparent, rgba(255, 248, 233, 0.55), transparent)',
        'aurora': 'linear-gradient(to bottom, #0f172a, #020617)',
        'aurora-gradient': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(22, 163, 74, 0.15), transparent)',
        'gradient-green': 'linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%)',
        'gradient-dark': 'linear-gradient(to bottom, #0f172a, #020617)',
        'hero-glow': 'radial-gradient(ellipse at center, rgba(22, 163, 74, 0.15), transparent 70%)',
        // BATCH 5: Premium Dashboard Background
        'cream-gradient': 'linear-gradient(180deg, #FBFAF7 0%, #F7F5F2 35%, #F0EBE3 70%, #E5DFD3 100%)',
        'linen-gradient': 'linear-gradient(180deg, #FBFAF7 0%, #F7F5F2 100%)',
        // ── Fairway design-system canvas wash (ADDITIVE — token-backed) ──
        // The warm-cream sunlit page gradient. `bg-canvas-gradient` is the
        // Fairway replacement for a flat `bg-canvas` on redesigned pages; it
        // resolves to --fw-gradient-canvas (src/styles/design-tokens.css) and
        // only renders where a Fairway surface opts in.
        'canvas-gradient': 'var(--fw-gradient-canvas)',
      },
      animation: {
        // ═══════════════════════════════════════════════════════════════
        // ENTRANCE ANIMATIONS - Use for elements entering view
        // ═══════════════════════════════════════════════════════════════
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-in-slow': 'fade-in 0.6s ease-out',
        'fade-up': 'fade-up 0.4s ease-out',
        'fade-up-slow': 'fade-up 0.6s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        'bounce-in': 'bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',

        // ═══════════════════════════════════════════════════════════════
        // INTERACTIVE ANIMATIONS - Use for user feedback
        // ═══════════════════════════════════════════════════════════════
        'shake': 'shake 0.4s ease-in-out',
        'card-hover': 'card-hover 0.2s ease-out',
        'check-bounce': 'check-bounce 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'number-tick': 'number-tick 0.5s ease-out',
        'count-up': 'count-up 2s ease-out forwards',

        // ═══════════════════════════════════════════════════════════════
        // CONTINUOUS ANIMATIONS - Use for background effects
        // ═══════════════════════════════════════════════════════════════
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
        'float-complex': 'float-complex 20s ease-in-out infinite',
        'float-delayed': 'float-delayed 20s ease-in-out infinite',
        'aurora': 'aurora 15s ease-in-out infinite alternate',
        'scroll-bounce': 'scroll-bounce 2s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'ripple': 'ripple 0.6s linear',
        'checkmark': 'checkmark 0.3s ease-out forwards',
        'progress-fill': 'progress-fill 0.8s ease-out forwards',
        'progress-indeterminate': 'progress-indeterminate 1.5s ease-in-out infinite',
        'badge-pulse': 'badge-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-4px)' },
          '40%, 80%': { transform: 'translateX(4px)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        'bounce-in': {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)' },
        },
        'aurora': {
          '0%': { opacity: '0.6', transform: 'translateY(0) scale(1)' },
          '50%': { opacity: '0.8', transform: 'translateY(-5%) scale(1.05)' },
          '100%': { opacity: '0.6', transform: 'translateY(0) scale(1)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'glow': {
          '0%': { boxShadow: '0 0 20px rgba(22, 163, 74, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(22, 163, 74, 0.5)' },
        },
        'count-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scroll-bounce': {
          '0%, 100%': { transform: 'translateY(0)', opacity: '1' },
          '50%': { transform: 'translateY(12px)', opacity: '0.3' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'card-hover': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-2px)' },
        },
        'number-tick': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'check-bounce': {
          '0%': { transform: 'scale(0)' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
        'float-complex': {
          '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' },
          '25%': { transform: 'translate(10px, -10px) rotate(1deg)' },
          '50%': { transform: 'translate(-5px, -15px) rotate(-1deg)' },
          '75%': { transform: 'translate(-10px, -5px) rotate(0.5deg)' },
        },
        'float-delayed': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '33%': { transform: 'translate(-10px, 10px)' },
          '66%': { transform: 'translate(10px, -5px)' },
        },
        'ripple': {
          '0%': { transform: 'scale(0)', opacity: '0.4' },
          '100%': { transform: 'scale(4)', opacity: '0' },
        },
        'checkmark': {
          '0%': { strokeDashoffset: '24', opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { strokeDashoffset: '0', opacity: '1' },
        },
        'progress-fill': {
          '0%': { width: '0%' },
          '100%': { width: 'var(--progress-width)' },
        },
        'progress-indeterminate': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        'badge-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.05)', opacity: '0.85' },
        },
        // ═══════════════════════════════════════════════════════════════
        // LEGACY KEYFRAMES - Keep for backward compatibility
        // Prefer kebab-case equivalents: fade-in, fade-up
        // ═══════════════════════════════════════════════════════════════
        'glowPulse': {
          '0%': { boxShadow: '0 0 20px rgba(251, 191, 36, 0.2)' },
          '100%': { boxShadow: '0 0 40px rgba(251, 191, 36, 0.4)' },
        },
        'fadeUp': {  // Use 'fade-up' instead
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fadeIn': {  // Use 'fade-in' instead
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slideUp': {  // Use 'slide-up' instead
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
        // Standardized glass blur values
        'glass-subtle': '12px',    // Large surfaces, filters
        'glass': '16px',           // Default for cards, panels
        'glass-prominent': '20px', // Nav, modals
      },
      transitionDuration: {
        'fast': '150ms',
        'DEFAULT': '200ms',
        'slow': '300ms',
        // Legacy durations
        'base': '220ms',
        '400': '400ms',
        // Cinematic motion — California-modern × neo-futurism brief.
        // Slow, intentional, never twitchy.
        '450': '450ms',
        '500': '500ms',
        '600': '600ms',
        '700': '700ms',
        'cinematic': '500ms',
      },
      transitionTimingFunction: {
        'DEFAULT': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        // ═══════════════════════════════════════════════════════════════
        // iOS SYSTEM EASING — use these for native-feeling animations
        // ═══════════════════════════════════════════════════════════════
        'ios': 'cubic-bezier(0.25, 0.1, 0.25, 1)',           // standard ease-out
        'ios-spring': 'cubic-bezier(0.32, 0.72, 0, 1)',      // iOS sheet / bottom sheet
        'ios-smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',       // iOS nav transition
        'ios-sharp': 'cubic-bezier(0.4, 0, 0.6, 1)',         // iOS alert dismiss
        // California-modern cinematic easing — same shape as ios-smooth
        // but exposed under a more readable name. The brief calls for
        // "slow, intentional, cinematic" motion, so heroes and surface
        // hovers reach for this curve at 450–600ms.
        'apple': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'cinematic': 'cubic-bezier(0.22, 1, 0.36, 1)',
        // Legacy timings
        'out': 'cubic-bezier(0.33, 1, 0.68, 1)',
        'smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
        'elastic': 'cubic-bezier(0.5, 1.5, 0.5, 1)',
      },
    },
  },
  // Filter falsy entries so a bad interop resolution can never inject an
  // `undefined` plugin into `resolveConfig` (the global CSS crash above).
  plugins: [tailwindcssAnimate].filter(Boolean) as Config["plugins"],
};
export default config;
