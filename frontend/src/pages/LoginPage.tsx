"use client"

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AsciiVignetteBloom } from '../components/ui/ascii-vignette-bloom'
import { ArrowRight, KeyRound } from 'lucide-react'

export default function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('Invalid email or password.')
    }
  }

  const quickLogin = async (e: string, p: string) => {
    setEmail(e)
    setPassword(p)
    setError('')
    try {
      await login(e, p)
      navigate('/')
    } catch {
      setError('Login failed.')
    }
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden select-none bg-black">
      {/* Full-Screen Ambient Vignette Bloom ASCII-Art Canvas */}
      <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none">
        <AsciiVignetteBloom
          src="/anl-logo.jpg"
          className="w-full h-full !rounded-none !border-none !shadow-none"
          params={{
            renderMode: 'mosaic',
            bgMode: 'solid',
            bgBlur: 12,
            bgOpacity: 90,
            cellSize: 16,
            coverage: 100,
            invert: false,
            styleBlend: 'source-over',
            charSet: 'standard',
            customChars: '',
            brightness: 12,
            contrast: 115,
            edgeEmphasis: 0,
            density: 0,
            toneCurve: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            tint: '#3ca6ff',
            tintOpacity: 0,
            overlayBlend: 'multiply',
            saturation: 100,
            grayscale: 0,
            blurType: 'off',
            blurAmount: 35,
            blurAngle: 0,
            directionalBothSides: false,
            tiltFocus: 35,
            tiltPosition: 50,
            tiltFeather: 15,
            lensFocus: 40,
            blurCenterX: 50,
            blurCenterY: 50,
            progressivePosition: 55,
            progressiveReverse: false,
            pfx: {
              vignette: { enabled: true, intensity: 38 },
              scanLines: { enabled: false, intensity: 40 },
              chromatic: { enabled: false, intensity: 15 },
              bloom: { enabled: true, intensity: 25 },
              filmGrain: { enabled: false, intensity: 30 },
              glitch: { enabled: false, intensity: 20 },
              pixelate: { enabled: false, intensity: 15 },
              halftone: { enabled: false, intensity: 20 },
              filmDust: { enabled: false, intensity: 20 },
            },
            animated: true,
            animStyle: 'wave',
            animSpeed: { enabled: true, intensity: 100 },
            animIntensity: { enabled: true, intensity: 60 },
            lights: { enabled: false, points: [] },
            mask: {
              enabled: false,
              tool: 'freehand',
              brushSize: 30,
              showOverlay: false,
              invert: false,
              dataUrl: null,
              shapes: [],
            },
          }}
        />
        {/* Deep Contrast Vignette Filter to ensure modal readability */}
        <div className="absolute inset-0 bg-black/45 pointer-events-none" />
      </div>

      {/* Floating Centered Modal Card */}
      <div className="relative z-10 w-full max-w-[420px] rounded-[30px] p-7 md:p-8 border border-white/[0.09] shadow-[0_30px_90px_rgba(0,0,0,0.85)] bg-[#0d121c]/88 backdrop-blur-2xl animate-fade-up">
        {/* macOS Traffic Lights Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block shadow-sm" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block shadow-sm" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block shadow-sm" />
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        </div>

        {/* Official Brand Logo */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-48 sm:w-56 overflow-hidden rounded-2xl border border-white/10 shadow-[0_12px_35px_rgba(0,0,0,0.7)] mb-3 bg-[#070a12]">
            <img
              src="/anl-logo.jpg"
              alt="Auction Night Live"
              className="w-full h-auto object-cover block"
            />
          </div>
          <p className="text-[11px] text-cream-muted font-mono tracking-wide">
            High-frequency British reverse auction network
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-cream-muted mb-1.5 font-mono">
              Corporate Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="buyer@anl.dev"
              className="w-full bg-[#080c14]/85 border border-white/10 focus:border-white/30 rounded-xl px-4 py-2.5 text-xs text-cream placeholder-slate-500 focus:outline-none transition-colors font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-cream-muted mb-1.5 font-mono">
              Access Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••••••"
              className="w-full bg-[#080c14]/85 border border-white/10 focus:border-white/30 rounded-xl px-4 py-2.5 text-xs text-cream placeholder-slate-500 focus:outline-none transition-colors font-mono"
            />
          </div>

          {error && (
            <div className="rounded-xl px-4 py-2 text-xs text-red-300 bg-red-500/10 border border-red-500/25 font-mono">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-full bg-[#f4ebe1] hover:bg-[#eadecf] active:scale-[0.99] text-black font-semibold text-xs tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all mt-2"
          >
            {loading ? (
              <span>Authenticating…</span>
            ) : (
              <>
                <span>Sign In to Terminal</span>
                <ArrowRight size={14} className="stroke-[2.5]" />
              </>
            )}
          </button>
        </form>

        {/* Fast Switch Demo Roles */}
        <div className="mt-6 pt-2">
          <p className="text-[9px] font-mono tracking-widest text-slate-500 uppercase text-center mb-3">
            FAST SWITCH DEMO ROLES
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Buyer (Host)', email: 'buyer@anl.dev' },
              { label: 'Supplier 1', email: 'supplier1@anl.dev' },
              { label: 'Supplier 2', email: 'supplier2@anl.dev' },
              { label: 'Supplier 3', email: 'supplier3@anl.dev' },
            ].map(a => (
              <button
                key={a.email}
                type="button"
                onClick={() => quickLogin(a.email, 'password123')}
                disabled={loading}
                className="bg-[#0b101a]/75 hover:bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-xs text-cream flex items-center justify-between transition-all"
              >
                <span className="font-medium text-[11px] truncate font-mono">{a.label}</span>
                <KeyRound size={11} className="text-slate-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
