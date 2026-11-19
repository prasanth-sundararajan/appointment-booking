/** @type {import('tailwindcss').Config} */
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
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
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 10px 30px -12px rgb(76 29 149 / 0.25), 0 4px 8px -4px rgb(15 23 42 / 0.08)',
        pop: '0 20px 50px -12px rgb(15 23 42 / 0.35)',
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
