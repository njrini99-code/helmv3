import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // HELM BRAND COLORS (OKLCH for modern color gamut)
        'helm-green': {
          DEFAULT: 'oklch(0.65 0.19 150)',
          50: 'oklch(0.95 0.05 150)',
          100: 'oklch(0.90 0.08 150)',
          200: 'oklch(0.82 0.12 150)',
          300: 'oklch(0.74 0.15 150)',
          400: 'oklch(0.70 0.17 150)',
          500: 'oklch(0.65 0.19 150)',
          600: 'oklch(0.58 0.19 150)',
          700: 'oklch(0.50 0.18 150)',
          800: 'oklch(0.42 0.16 150)',
          900: 'oklch(0.35 0.13 150)',
        },
        'helm-amber': {
          DEFAULT: 'oklch(0.70 0.18 45)',
          50: 'oklch(0.95 0.05 45)',
          100: 'oklch(0.90 0.08 45)',
          200: 'oklch(0.85 0.12 45)',
          300: 'oklch(0.78 0.15 45)',
          400: 'oklch(0.74 0.17 45)',
          500: 'oklch(0.70 0.18 45)',
          600: 'oklch(0.62 0.18 45)',
          700: 'oklch(0.54 0.17 45)',
          800: 'oklch(0.46 0.15 45)',
          900: 'oklch(0.38 0.12 45)',
        },
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

        // CREAM BACKGROUND (warm off-white scale)
        cream: {
          DEFAULT: '#FFFEFA',
          50: '#FFFEFA',      // Lightest — same as DEFAULT, subtle bg tint
          100: '#FDF9F3',     // Light cream — hover states, tab backgrounds
          200: '#F5F0E8',     // Visible cream — table rows, message bubbles
          300: '#EDE8DD',     // Warm divider tone
        },

        // SEMANTIC COLORS
        success: '#16A34A',  // Same as primary
        warning: '#F59E0B',  // Amber
        danger: '#DC2626',   // Red
        info: '#3B82F6',     // Blue

        // GLASS EFFECTS - Standardized System
        // Use with backdrop-blur-glass, backdrop-blur-glass-subtle, or backdrop-blur-glass-prominent
        glass: {
          // Background opacities
          subtle: 'rgba(255, 255, 255, 0.55)',      // Large surfaces, filters
          DEFAULT: 'rgba(255, 255, 255, 0.7)',      // Standard cards, panels
          prominent: 'rgba(255, 255, 255, 0.8)',    // Nav, modals
          // Legacy aliases (backward compat)
          white: 'rgba(255, 255, 255, 0.7)',
          'white-strong': 'rgba(255, 255, 255, 0.85)',
          medium: 'rgba(255, 255, 255, 0.5)',
          // Borders
          border: 'rgba(255, 255, 255, 0.4)',       // Subtle border
          'border-strong': 'rgba(255, 255, 255, 0.5)', // Standard border
          'border-prominent': 'rgba(255, 255, 255, 0.6)', // Prominent border
          // Dark glass
          dark: 'rgba(28, 25, 23, 0.97)',
          // Input fields
          input: 'rgba(255, 255, 255, 0.6)',
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
        'field': 'rgb(var(--field) / <alpha-value>)',
        'fairway': 'rgb(var(--fairway) / <alpha-value>)',
        border: {
          light: '#ECEAE6',
          DEFAULT: '#E0DED9',
          dark: '#D4D1CC'
        },
      },
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Playfair Display', 'Georgia', 'serif'],
      },
      fontSize: {
        'micro': ['10px', { lineHeight: '14px' }],  // Badges, annotations
        'label': ['11px', { lineHeight: '16px' }],   // Form labels, captions
        'xs': '12px',
        'sm': '14px',
        'base': '16px',      // Body text
        'lg': '18px',
        'xl': '20px',
        'h3': '24px',
        'h2': '28px',
        'h1': '30px',        // Dashboard H1 (text-3xl)
        'display': '36px',
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
        'sm': '8px',
        'md': '10px',      // Buttons, inputs
        'lg': '14px',
        'xl': '16px',
        '2xl': '20px',     // Cards (rounded-xl = 20px)
        '3xl': '24px',
        'full': '9999px',
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
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'mesh': 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%2316a34a\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.3))',
        'shimmer': 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
        'aurora': 'linear-gradient(to bottom, #0f172a, #020617)',
        'aurora-gradient': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(22, 163, 74, 0.15), transparent)',
        'gradient-green': 'linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%)',
        'gradient-dark': 'linear-gradient(to bottom, #0f172a, #020617)',
        'hero-glow': 'radial-gradient(ellipse at center, rgba(22, 163, 74, 0.15), transparent 70%)',
        // BATCH 5: Premium Dashboard Background
        'cream-gradient': 'linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 35%, #F5F0E6 70%, #EDE8DD 100%)',
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
        'shimmer': 'shimmer 2s infinite',
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
        // Legacy timings
        'out': 'cubic-bezier(0.33, 1, 0.68, 1)',
        'smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
        'elastic': 'cubic-bezier(0.5, 1.5, 0.5, 1)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
