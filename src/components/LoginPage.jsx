import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAdminAuth } from './AdminAuthContext'
import { isLocalRuntime, runtimeLabel } from '../lib/runtime'
import mastheadLogo from '../assets/sabotpress-masthead.svg'

function getReturnTo(search = '') {
  const params = new URLSearchParams(search)
  const value = params.get('returnTo') || params.get('next') || '/wp-admin'
  if (!value.startsWith('/') || value.startsWith('//')) return '/wp-admin'
  return value
}

export function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, isChecking, login, authError, session } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const returnTo = useMemo(() => getReturnTo(location.search), [location.search])
  const localRuntime = isLocalRuntime()

  async function submitUser(event) {
    event.preventDefault()
    setSubmitError('')
    if (!email.trim() || !password) { setSubmitError('Email and password are required.'); return }
    setIsSubmitting(true)
    const ok = await login({ email, password })
    setIsSubmitting(false)
    if (ok) navigate(returnTo, { replace: true })
  }

  async function submitBootstrap(event) {
    event.preventDefault()
    setSubmitError('')
    if (!token.trim()) { setSubmitError('Emergency admin token is required.'); return }
    setIsSubmitting(true)
    const ok = await login({ token })
    setIsSubmitting(false)
    if (ok) navigate(returnTo, { replace: true })
  }

  if (localRuntime) {
    return <main className="page admin-login-page"><section className="admin-login-panel" aria-labelledby="admin-login-title">
      <img className="admin-login-panel__logo" src={mastheadLogo} alt="SabotPress" />
      <h1 id="admin-login-title">No sign in needed</h1>
      <p>{runtimeLabel()}. This local edition does not use a SabotPress account.</p>
      <div className="admin-login-panel__actions"><Link className="button button--primary" to={returnTo}>Continue to newsroom</Link><Link className="button" to="/">Preview site</Link></div>
    </section></main>
  }

  return (
    <main className="page admin-login-page">
      <section className="admin-login-panel" aria-labelledby="admin-login-title">
        <img className="admin-login-panel__logo" src={mastheadLogo} alt="SabotPress" />
        {isAuthenticated ? (
          <>
            <h1 id="admin-login-title">You are logged in</h1>
            <p>{session?.user?.email ? `${session.user.email} · ${session.role}` : `Emergency owner session · ${session?.role || 'owner'}`}</p>
            <div className="admin-login-panel__actions"><Link className="button button--primary" to={returnTo}>Continue</Link><Link className="button" to="/wp-admin">Dashboard</Link><Link className="button" to="/logout">Logout</Link></div>
          </>
        ) : (
          <>
            <h1 id="admin-login-title">SabotPress sign in</h1>
            <p>Use your individual account. Access is tied to your user identity and enforced role.</p>
            <form onSubmit={submitUser} className="admin-login-account-form">
              <label><span>Email</span><input autoComplete="username" autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label><span>Password</span><input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {submitError || authError ? <p className="admin-login-panel__error">{submitError || authError}</p> : null}
              <button className="button button--primary" type="submit" disabled={isSubmitting || isChecking}>{isSubmitting || isChecking ? 'Checking…' : 'Sign in'}</button>
            </form>
            <details className="admin-login-bootstrap"><summary>Emergency / bootstrap admin token</summary><p className="description">Use this only to recover access or provision the first Owner account. It remains an Owner-level escape hatch and should not be shared for everyday login.</p><form onSubmit={submitBootstrap}><label><span>Admin token</span><input autoComplete="off" type="password" value={token} onChange={(event) => setToken(event.target.value)} /></label><button className="button" type="submit" disabled={isSubmitting || isChecking}>Use emergency token</button></form></details>
          </>
        )}
      </section>
    </main>
  )
}
