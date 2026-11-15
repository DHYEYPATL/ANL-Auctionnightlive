import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: { 950:'#07070d', 900:'#0d0d14', 800:'#12121a', 700:'#17171f', 600:'#1c1c26', 500:'#22222d' },
        accent: { DEFAULT:'#6366f1', light:'#818cf8', dark:'#4f46e5', muted:'rgba(99,102,241,0.12)', glow:'rgba(99,102,241,0.25)' },
        status: {
          active:'#10b981', 'active-m':'rgba(16,185,129,0.12)',
          scheduled:'#3b82f6', 'scheduled-m':'rgba(59,130,246,0.12)',
          closed:'#475569', 'closed-m':'rgba(71,85,105,0.12)',
          'force-closed':'#ef4444', 'force-m':'rgba(239,68,68,0.12)',
          draft:'#6b7280', cancelled:'#44403c',
        },
        event: { bid:'#3b82f6', rank:'#f59e0b', ext:'#10b981', close:'#64748b', pub:'#8b5cf6' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      borderRadius: { '2xl':'1rem', '3xl':'1.25rem', '4xl':'2rem' },
      animation: {
        'fade-up':     'fadeUp 0.4s ease-out',
        'fade-in':     'fadeIn 0.3s ease-out',
        'pulse-soft':  'pulseSoft 3s ease-in-out infinite',
        'glow-ring':   'glowRing 2s ease-in-out infinite',
        'float':       'float 6s ease-in-out infinite',
        'digit':       'digit 0.25s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
        'rank-flash':  'rankFlash 0.6s ease-out',
      },
      keyframes: {
        fadeUp:    { '0%':{ opacity:'0', transform:'translateY(12px)' }, '100%':{ opacity:'1', transform:'translateY(0)' } },
        fadeIn:    { '0%':{ opacity:'0' }, '100%':{ opacity:'1' } },
        pulseSoft: { '0%,100%':{ opacity:'1' }, '50%':{ opacity:'0.5' } },
        glowRing:  { '0%,100%':{ boxShadow:'0 0 8px rgba(99,102,241,0.3)' }, '50%':{ boxShadow:'0 0 24px rgba(99,102,241,0.6)' } },
        float:     { '0%,100%':{ transform:'translateY(0)' }, '50%':{ transform:'translateY(-8px)' } },
        digit:     { '0%':{ transform:'translateY(-4px)', opacity:'0' }, '100%':{ transform:'translateY(0)', opacity:'1' } },
        slideRight:{ '0%':{ transform:'translateX(-8px)', opacity:'0' }, '100%':{ transform:'translateX(0)', opacity:'1' } },
        rankFlash: { '0%':{ background:'rgba(99,102,241,0.2)' }, '100%':{ background:'transparent' } },
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        glow:  '0 0 32px rgba(99,102,241,0.4)',
        'glow-sm': '0 0 12px rgba(99,102,241,0.3)',
        'inner-top': 'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config
