/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        editor: {
          bg: '#0f1115',
          panel: '#161920',
          panelBorder: '#232734',
          surface: '#1c202a',
          surfaceHover: '#242a38',
          accent: '#3b82f6',
          accentHover: '#2563eb',
          textMuted: '#94a3b8',
          trackBg: '#12141a',
          clipBg: '#1e293b',
          clipBorder: '#334155',
          clipActive: '#2563eb',
        }
      },
      aspectRatio: {
        '16/9': '16 / 9',
      }
    },
  },
  plugins: [],
}
