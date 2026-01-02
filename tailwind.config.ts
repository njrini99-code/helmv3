import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // PRIMARY BRAND COLORS
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16A34A',  // PRIMARY BRAND COLOR
          700: '#15803D',
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

        // CREAM BACKGROUND
        cream: '#FFFEFA',

        // SEMANTIC COLORS
        success: '#16A34A',  // Same as primary
        warning: '#F59E0B',  // Amber
        danger: '#DC2626',   // Red
        info: '#3B82F6',     // Blue

        // GLASS EFFECTS
        glass: {
          white: 'rgba(255, 255, 255, 0.7)',
          'white-strong': 'rgba(255, 255, 255, 0.85)',
          medium: 'rgba(255, 255, 255, 0.5)',
          subtle: 'rgba(255, 255, 255, 0.3)',
          dark: 'rgba(28, 25, 23, 0.97)',
          border: 'rgba(255, 255, 255, 0.2)',
          'border-strong': 'rgba(255, 255, 255, 0.3)',
          input: 'rgba(255, 255, 255, 0.6)',
        },

        // Legacy colors for backward compatibility
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
        onboarding: {
          'kelly-green': '#169B45',
          'kelly-green-hover': '#128A3D',
          'kelly-green-muted': 'rgba(22, 155, 69, 0.1)',
          'cream': '#FFFDF7',
          'warm-white': '#FAFAF8',
          'black': '#000000',
          'rich-black': '#0A0A0A',
          'text-primary': '#1A1A1A',
          'text-secondary': '#6B6B6B',
          'text-muted': '#9B9B9B',
          'border-light': 'rgba(0, 0, 0, 0.08)',
          'border-medium': 'rgba(0, 0, 0, 0.12)',
        },
        brand: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
        },
        border: {
          light: '#ECEAE6',
          DEFAULT: '#E0DED9',
          dark: '#D4D1CC'
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Playfair Display', 'Georgia', 'serif'],
        'sf-pro': ['"SF Pro Display"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      fontSize: {
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
        'sm': '0 1px 2px rgba(0,0,0,0.05)',
        'DEFAULT': '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
        'md': '0 4px 6px rgba(0,0,0,0.07)',
        'lg': '0 10px 15px rgba(0,0,0,0.1)',
        'xl': '0 20px 25px rgba(0,0,0,0.1)',
        'glass': '0 8px 32px rgba(0,0,0,0.08)',
        'card-hover': '0 12px 24px rgba(0,0,0,0.12)',
        // Legacy shadows
        'subtle': '0 1px 2px rgba(0,0,0,0.04)',
        'glow-amber': '0 0 30px rgba(217,119,6,0.15)',
        'glow-emerald': '0 0 30px rgba(16,185,129,0.15)',
        'xs': '0 1px 2px rgba(0,0,0,0.04)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        'elevation-1': '0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
        'elevation-2': '0 4px 8px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.03)',
        'elevation-3': '0 8px 16px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.04)',
        'elevation-4': '0 16px 32px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.06)',
        'glow-green': '0 0 20px rgba(22, 163, 74, 0.3)',
        'glow-green-lg': '0 0 40px rgba(22, 163, 74, 0.4)',
        'glow-green-intense': '0 0 60px rgba(22, 163, 74, 0.5)',
        'inner-highlight': 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'focus-ring': '0 0 0 3px rgba(22, 163, 74, 0.1)',
        'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.12)',
        'card': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        // BATCH 5: Premium Glass Shadow System
        'glass-sm': '0 1px 2px rgba(0,0,0,0.02), 0 2px 4px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glass-md': '0 1px 2px rgba(0,0,0,0.02), 0 4px 8px rgba(0,0,0,0.02), 0 8px 16px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glass-lg-batch5': '0 2px 4px rgba(0,0,0,0.02), 0 8px 16px rgba(0,0,0,0.03), 0 16px 32px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)',
        'glass-xl': '0 4px 8px rgba(0,0,0,0.02), 0 12px 24px rgba(0,0,0,0.04), 0 24px 48px rgba(0,0,0,0.06), 0 48px 96px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
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
        shake: 'shake 0.4s ease-in-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-in-slow': 'fade-in 0.6s ease-out',
        'fade-up': 'fade-up 0.4s ease-out',
        'fade-up-slow': 'fade-up 0.6s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        'shimmer': 'shimmer 2s infinite',
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-in': 'bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'spin-slow': 'spin 3s linear infinite',
        'aurora': 'aurora 15s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
        'float-complex': 'float-complex 20s ease-in-out infinite',
        'float-delayed': 'float-delayed 20s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'count-up': 'count-up 2s ease-out forwards',
        'scroll-bounce': 'scroll-bounce 2s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'card-hover': 'card-hover 0.2s ease-out',
        'number-tick': 'number-tick 0.5s ease-out',
        'check-bounce': 'check-bounce 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
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
        'glowPulse': {
          '0%': { boxShadow: '0 0 20px rgba(251, 191, 36, 0.2)' },
          '100%': { boxShadow: '0 0 40px rgba(251, 191, 36, 0.4)' },
        },
        'fadeUp': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fadeIn': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slideUp': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
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
        // Legacy timings
        'out': 'cubic-bezier(0.33, 1, 0.68, 1)',
        'smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
      },
    },
  },
  plugins: [],
};
export default config;
