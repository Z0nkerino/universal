/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0A',
        paper: '#FFFFFF',
        // Accent colors come from the user's palette (src/lib/appearance.ts).
        blue: 'rgb(var(--blue-rgb) / <alpha-value>)',
        pink: 'rgb(var(--pink-rgb) / <alpha-value>)',
        // Neutrals are tints of ink, driven by CSS vars so they flip with the theme.
        fg: 'rgb(var(--fg) / <alpha-value>)',
        bg: 'rgb(var(--bg) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      borderRadius: { glass: '24px', '4xl': '28px' },
      backgroundImage: { brand: 'linear-gradient(135deg, var(--blue) 0%, var(--pink) 100%)' },
    },
  },
  plugins: [],
};
