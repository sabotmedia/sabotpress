import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getEditorPermissionsSnapshot } from '../lib/editorPermissions'

const AdminAuthContext = createContext(null)

export function AdminAuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [authError, setAuthError] = useState('')
  const [permissions, setPermissions] = useState(null)
  const [session, setSession] = useState(null)

  const refreshAuth = useCallback(async () => {
    try {
      setIsChecking(true)
      setAuthError('')
      const sessionRes = await fetch('/api/session', { method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json' } })
      const sessionData = await safeJson(sessionRes)
      const allowed = Boolean(sessionRes.ok && sessionData?.authenticated)
      setSession(sessionData || null)
      const snapshot = allowed ? await getEditorPermissionsSnapshot() : null
      setPermissions(snapshot || null)
      setIsAuthenticated(allowed)
      if (!allowed) setAuthError('')
      return allowed
    } catch (error) {
      setSession(null)
      setPermissions(null)
      setIsAuthenticated(false)
      setAuthError(String(error?.message || error))
      return false
    } finally {
      setIsChecking(false)
    }
  }, [])

  useEffect(() => { refreshAuth() }, [refreshAuth])

  const login = useCallback(async (credentials) => {
    try {
      setIsChecking(true)
      setAuthError('')
      const body = typeof credentials === 'string'
        ? { token: credentials.trim() }
        : {
            ...(credentials?.email ? { email: String(credentials.email).trim() } : {}),
            ...(credentials?.password ? { password: String(credentials.password) } : {}),
            ...(credentials?.token ? { token: String(credentials.token).trim() } : {}),
          }
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await safeJson(res)
      if (!res.ok || !data?.authenticated) {
        setSession(null)
        setPermissions(null)
        setIsAuthenticated(false)
        setAuthError(data?.error || 'Login failed.')
        return false
      }
      return refreshAuth()
    } catch (error) {
      setSession(null)
      setPermissions(null)
      setIsAuthenticated(false)
      setAuthError(String(error?.message || error))
      return false
    } finally {
      setIsChecking(false)
    }
  }, [refreshAuth])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' } })
    } catch {
      // Clear local state even if the network fails; the next session check will reconcile.
    }
    setSession(null)
    setPermissions(null)
    setIsAuthenticated(false)
    setAuthError('')
    setIsChecking(false)
  }, [])

  const value = useMemo(() => ({
    isAuthenticated,
    isChecking,
    authError,
    permissions,
    session,
    role: session?.role || '',
    capabilities: Array.isArray(session?.capabilities) ? session.capabilities : [],
    login,
    logout,
    refreshAuth,
  }), [authError, isAuthenticated, isChecking, login, logout, permissions, refreshAuth, session])

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider')
  return ctx
}

async function safeJson(res) {
  try { return await res.json() } catch { return null }
}
