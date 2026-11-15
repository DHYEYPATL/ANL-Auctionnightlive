import { useContext } from 'react'
import { AuthContext } from '../app/auth-provider'

export function useAuth() {
  return useContext(AuthContext)
}
