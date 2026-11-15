/**
 * HD-SEC-01: Shows "Session expired" banner without wiping form state.
 * User re-authenticates in-place; bid form state and idempotency key remain.
 */
import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Button } from './ui/Button'

export function SessionExpiredBanner() {
  const { sessionExpired, login, loading, clearExpired } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  if (!sessionExpired) return null

  const handleRelogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    try {
      await login(email, password)
      clearExpired()
    } catch {
      setErr('Invalid credentials.')
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 glass-card-lg rounded-2xl p-5 shadow-glass-lg border border-amber-500/30 bg-amber-500/5">
      <p className="text-sm font-semibold text-amber-300 mb-1">Session expired</p>
      <p className="text-xs text-slate-400 mb-3">
        Your bid was <strong>NOT submitted</strong>. Sign in again to continue — your form is preserved.
      </p>
      <form onSubmit={handleRelogin} className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent/50"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent/50"
        />
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex gap-2">
          <Button type="submit" loading={loading} size="sm" className="flex-1">Sign In</Button>
          <Button type="button" variant="ghost" size="sm" onClick={clearExpired}>Dismiss</Button>
        </div>
      </form>
    </div>
  )
}
