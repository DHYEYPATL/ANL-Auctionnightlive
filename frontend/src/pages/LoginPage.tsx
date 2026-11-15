import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

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
    setEmail(e); setPassword(p)
    setError('')
    try { await login(e, p); navigate('/') } catch { setError('Login failed.') }
  }

  return (
    <div className="min-h-screen bg-base-950 flex items-center justify-center p-4 overflow-hidden">
      {/* Background mesh */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-30%] left-[50%] -translate-x-1/2 w-[800px] h-[800px] rounded-full"
          style={{background:'radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 65%)'}} />
        <div className="absolute bottom-[-20%] left-[-5%] w-[500px] h-[500px] rounded-full"
          style={{background:'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 65%)'}} />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.015]"
          style={{backgroundImage:'linear-gradient(rgba(255,255,255,0.3) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.3) 1px,transparent 1px)',backgroundSize:'48px 48px'}} />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl mb-4 flex items-center justify-center animate-glow-ring"
            style={{background:'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',boxShadow:'0 0 32px rgba(99,102,241,0.4)'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-grad tracking-tight">Auction Night Live</h1>
          <p className="text-sm text-slate-600 mt-1">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-3xl p-6">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@example.com" className="input-dark" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••" className="input-dark" />
            </div>
            {error && (
              <div className="rounded-xl px-4 py-2.5 text-xs text-red-300 bg-red-500/10 border border-red-500/20">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full mt-1 flex items-center justify-center gap-2">
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <>Continue <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></>
              )}
            </button>
          </form>

          {/* Quick login */}
          <hr className="divider my-5" />
          <p className="text-[11px] text-slate-700 text-center mb-3 uppercase tracking-widest font-medium">Demo accounts</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Buyer', email: 'buyer@anl.dev', color: '#6366f1' },
              { label: 'Supplier 1', email: 'supplier1@anl.dev', color: '#8b5cf6' },
              { label: 'Supplier 2', email: 'supplier2@anl.dev', color: '#06b6d4' },
              { label: 'Supplier 3', email: 'supplier3@anl.dev', color: '#10b981' },
            ].map(a => (
              <button
                key={a.email}
                onClick={() => quickLogin(a.email, 'password123')}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition-all border border-white/[0.05] hover:border-white/10"
                style={{background:'rgba(255,255,255,0.025)'}}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:a.color}} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
