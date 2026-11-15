import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Rich dark palette
        base: {
          950: '#07070d',
          900: '#0a0a0f',
          800: '#111118',
          700: '#18181f',
          600: '#1e1e28',
          500: '#25252f',
        },
        glass: {
          border: 'rgba(255,255,255,0.08)',
          bg: 'rgba(255,255,255,0.04)',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          glow: 'rgba(99,102,241,0.3)',
          muted: 'rgba(99,102,241,0.15)',
        },
        status: {
          active: '#10b981',
          'active-muted': 'rgba(16,185,129,0.15)',
          scheduled: '#3b82f6',
          'scheduled-muted': 'rgba(59,130,246,0.15)',
          closed: '#64748b',
          'closed-muted': 'rgba(100,116,139,0.15)',
          'force-closed': '#ef4444',
          'force-closed-muted': 'rgba(239,68,68,0.15)',
          draft: '#71717a',
          cancelled: '#57534e',
        },
        bid: '#3b82f6',
        rank: '#f59e0b',
        extension: '#10b981',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '16px',
        xl: '24px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'digit-flip': 'digitFlip 0.3s ease-in-out',
        'rank-move': 'rankMove 0.5s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(99,102,241,0.3)' },
          '50%': { boxShadow: '0 0 24px rgba(99,102,241,0.6)' },
        },
        digitFlip: {
          '0%': { transform: 'rotateX(-90deg)', opacity: '0' },
          '100%': { transform: 'rotateX(0)', opacity: '1' },
        },
        rankMove: {
          '0%': { background: 'rgba(99,102,241,0.2)' },
          '100%': { background: 'transparent' },
        },
      },
      boxShadow: {
        glass: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glass-lg': '0 8px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
        glow: '0 0 24px rgba(99,102,241,0.4)',
        'glow-sm': '0 0 8px rgba(99,102,241,0.3)',
      },
    },
  },
  plugins: [],
}

export default config
