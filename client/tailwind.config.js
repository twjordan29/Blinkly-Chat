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
        // Theme-independent semantic mappings
        surface: 'var(--color-bg)',
        sidebar: 'var(--color-sidebar)',
        chat: 'var(--color-chat)',
        bordercolor: 'var(--color-border)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        sent: 'var(--color-bubble-sent)',
        'sent-text': 'var(--color-bubble-sent-text)',
        received: 'var(--color-bubble-received)',
        'received-text': 'var(--color-bubble-received-text)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        card: 'var(--color-card)',
        
        // Brand details
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6', // Violet Accent
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        }
      },
      boxShadow: {
        'premium-sm': '0 1px 2px 0 var(--color-shadow)',
        'premium-md': '0 4px 12px -2px var(--color-shadow), 0 2px 6px -1px var(--color-shadow)',
        'premium-lg': '0 10px 25px -5px var(--color-shadow), 0 8px 10px -6px var(--color-shadow)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.97)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
