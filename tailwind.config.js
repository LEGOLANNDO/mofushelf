/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'mofu-bg': '#FFFDF9',
        'mofu-sub': '#FDF6EC',
        'mofu-pink': '#FF8FA3',
        'mofu-pink-dark': '#F26B83',
        'mofu-mint': '#7AD9C5',
        'mofu-mint-dark': '#3FB59D',
        'mofu-yellow': '#FFE082',
        'mofu-yellow-dark': '#D99B16',
        'mofu-text': '#4A3F35',
        'mofu-muted': '#8C7A6B',
      },
      fontFamily: {
        rounded: [
          '"M PLUS Rounded 1c"',
          '"Hiragino Maru Gothic ProN"',
          '"Yu Gothic"',
          'Meiryo',
          'sans-serif',
        ],
      },
      boxShadow: {
        mofu: '0 6px 20px -4px rgba(140, 122, 107, 0.12), 0 2px 8px -2px rgba(255, 143, 163, 0.14)',
        'mofu-lg': '0 14px 32px -6px rgba(140, 122, 107, 0.18), 0 6px 14px -4px rgba(255, 143, 163, 0.22)',
      },
      keyframes: {
        'pop-bounce': {
          '0%': { transform: 'scale(0.92)' },
          '45%': { transform: 'scale(1.06)' },
          '75%': { transform: 'scale(0.98)' },
          '100%': { transform: 'scale(1)' },
        },
        'float-soft': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'scan-line': {
          '0%, 100%': { top: '12%' },
          '50%': { top: '84%' },
        },
      },
      animation: {
        'pop-bounce': 'pop-bounce 0.36s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'float-soft': 'float-soft 3s ease-in-out infinite',
        'scan-line': 'scan-line 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
