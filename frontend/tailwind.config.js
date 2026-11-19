/** @type {import('tailwindcss').Config} */
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark theme base (deep navy).
        navy: {
          700: '#232d5a',
          800: '#182044',
          900: '#111733',
          950: '#0b1026',
        },
        // Semantic dark-theme tokens.
        surface: {
          DEFAULT: 'rgb(255 255 255 / 0.05)',
          raised: 'rgb(255 255 255 / 0.08)',
          sunken: 'rgb(0 0 0 / 0.2)',
          solid: '#141b3d',
        },
        line: {
          DEFAULT: 'rgb(255 255 255 / 0.10)',
          strong: 'rgb(255 255 255 / 0.18)',
        },
        ink: {
          DEFAULT: '#f1f5f9',
          muted: '#cbd5e1',
          subtle: '#94a3b8',
        },
        // Primary brand (violet). 600+ passes WCAG AA on white for text.
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        // Secondary accent used only in gradients and highlights.
        accent: {
          50: '#fdf2f8',
          100: '#fce7f3',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
        },
        // Neutral scale (slate-tinted gray) for text, borders and surfaces.
        gray: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      fontSize: {
        display: ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '800' }],
      },
      borderRadius: {
        control: '0.625rem',
        card: '1rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.25), 0 8px 24px -12px rgb(2 6 23 / 0.6)',
        'card-hover': '0 16px 40px -12px rgb(139 92 246 / 0.35), 0 4px 12px -4px rgb(2 6 23 / 0.6)',
        pop: '0 24px 60px -12px rgb(2 6 23 / 0.8)',
      },
      ringOffsetColor: {
        DEFAULT: '#0b1026',
      },
      maxWidth: {
        page: '72rem',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
