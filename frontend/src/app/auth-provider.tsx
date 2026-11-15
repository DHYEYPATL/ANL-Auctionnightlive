/**
 * HD-SEC-01: 401 never loses form state.
 * The auth context stores whether a session expired mid-auction.
 */
import React, { createContext, useState, useCallback } from 'react'
import client, { setToken } from '../api/client'
import type { User } from '../types/api'

interface AuthState {
  user: User | null
  loading: boolean
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  clearExpired: () => void
}

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: false,
  sessionExpired: false,
  login: async () => {},
  logout: () => {},
  clearExpired: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true)
    try {
      const { data } = await client.post('/auth/login', { email, password })
      setToken(data.access_token)
      const { data: me } = await client.get('/me')
      setUser(me)
      setSessionExpired(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const clearExpired = useCallback(() => setSessionExpired(false), [])

  // HD-SEC-01: intercept 401 from client and mark session as expired (not logout)
  React.useEffect(() => {
    const id = client.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 && user) {
          // Don't clear user — preserve form state; just mark expired
          setSessionExpired(true)
          setToken(null)
        }
        return Promise.reject(err)
      }
    )
    return () => client.interceptors.response.eject(id)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, login, logout, clearExpired }}>
      {children}
    </AuthContext.Provider>
  )
}
