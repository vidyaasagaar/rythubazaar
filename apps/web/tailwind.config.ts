import type { Config } from 'tailwindcss';

/** Design tokens. Every colour, radius and shadow in the UI comes from here. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: { 50: '#FDFBF6', 100: '#FAF6EC', 200: '#F3EDDD', 300: '#E9E1CE' },
        line: { DEFAULT: '#E4DBC8', strong: '#D3C8B0' },
        ink: { DEFAULT: '#1E2A1F', soft: '#3A463B', muted: '#5F6A5D', faint: '#8A9387' },
        forest: {
          50: '#EEF5EF',
          100: '#D9EADC',
          200: '#B4D4BA',
          400: '#4E9563',
          500: '#2F7A47',
          600: '#246339',
          700: '#1C4F2E',
          800: '#163F25',
          900: '#10301C',
        },
        earth: { 50: '#F8F1E7', 100: '#F1E4D1', 400: '#B98A5C', 500: '#9A6B3F', 700: '#6E4A2A' },
        turmeric: { 50: '#FDF6E3', 100: '#F9EAC4', 600: '#A86D12', 700: '#8A5A0F' },
        chili: { 50: '#FCEEEC', 100: '#F8DAD6', 600: '#B3261E', 700: '#8F1F18' },
        sky: { 50: '#EDF4FA', 100: '#D9E7F3', 600: '#2C5F8A', 700: '#244E72' },
        handset: { 900: '#161917', 800: '#1F2320', 700: '#2A2F2B', 600: '#363C37', 500: '#454C46' },
        lcd: { 50: '#F1F5EA', 100: '#E4ECD8', 200: '#D2DDC2', ink: '#1F2B1D' },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Noto Sans"',
          '"Noto Sans Telugu"',
          '"Noto Sans Tamil"',
          '"Noto Sans Kannada"',
          '"Noto Sans Malayalam"',
          '"Noto Sans Devanagari"',
          'sans-serif',
        ],
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', '"Noto Serif"', 'serif'],
        mono: ['ui-monospace', '"SF Mono"', '"Cascadia Mono"', 'Consolas', 'monospace'],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      boxShadow: {
        soft: '0 1px 2px rgba(30,42,31,0.05), 0 2px 8px rgba(30,42,31,0.05)',
        card: '0 1px 2px rgba(30,42,31,0.06), 0 8px 24px -12px rgba(30,42,31,0.18)',
        lift: '0 2px 6px rgba(30,42,31,0.08), 0 24px 48px -20px rgba(30,42,31,0.35)',
        key: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.35)',
        keyPressed: 'inset 0 2px 4px rgba(0,0,0,0.45)',
        lcd: 'inset 0 2px 6px rgba(20,30,18,0.25), inset 0 0 0 1px rgba(20,30,18,0.15)',
      },
      keyframes: {
        pulseRing: {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: { pulseRing: 'pulseRing 1.4s ease-out infinite', fadeIn: 'fadeIn 180ms ease-out' },
    },
  },
  plugins: [],
} satisfies Config;
