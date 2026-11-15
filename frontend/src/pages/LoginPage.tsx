import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Zap } from 'lucide-react'

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

  return (
    <div className="min-h-screen bg-base-900 flex items-center justify-center p-4">
      {/* Gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent pointer-events-none" />

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center mb-4 shadow-glow">
            <Zap size={28} className="text-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Auction Night Live</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>

        <div className="glass-card-lg rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              />
            </div>

            {error && (
              <p className="text-xs text-status-force-closed bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
              Sign In
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <p className="text-xs text-slate-600 text-center mb-2">Demo credentials</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
              <div className="bg-base-700 rounded px-2 py-1.5">
                <p className="text-slate-400 font-medium">Buyer</p>
                <p>buyer@anl.dev</p>
                <p>password123</p>
              </div>
              <div className="bg-base-700 rounded px-2 py-1.5">
                <p className="text-slate-400 font-medium">Supplier</p>
                <p>supplier1@anl.dev</p>
                <p>password123</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
