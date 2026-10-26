/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0A',
        paper: '#FFFFFF',
        blue: { DEFAULT: '#2F6BFF' },
        pink: { DEFAULT: '#FF4FA3' },
        // Neutrals are tints of ink, driven by CSS vars so they flip with the theme.
        fg: 'rgb(var(--fg) / <alpha-value>)',
        bg: 'rgb(var(--bg) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { glass: '24px', '4xl': '28px' },
      backgroundImage: { brand: 'linear-gradient(135deg, #2F6BFF 0%, #FF4FA3 100%)' },
    },
  },
  plugins: [],
};
