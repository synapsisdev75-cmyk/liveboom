/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        boom: {
          bg: '#0A0A0B',
          panel: '#131417',
          elevated: '#1A1C22',
          line: '#2A2D36',
          cyan: '#00F0FF',
          fuchsia: '#FF0055',
          gold: '#F5C84C',
        },
      },
      fontFamily: {
        sans: ['Inter', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 28px rgba(0, 240, 255, 0.22)',
        gift: '0 0 24px rgba(255, 0, 85, 0.35)',
      },
    },
  },
  plugins: [],
};
