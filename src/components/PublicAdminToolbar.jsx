import { useMemo, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePublicEdit } from './PublicEditContext'
import { useAdminAuth } from './AdminAuthContext'
import { getEditorPermissionsSnapshot } from '../lib/editorPermissions'
import { loadNativeCollection } from '../lib/nativePublicContent'
import mastheadLogo from '../assets/sabotpress-masthead.svg'
import { adminRoutes } from '../routing/routes'

export function PublicAdminToolbar() {
  const siteTitle = 'SabotPress'
  const location = useLocation()
  const navigate = useNavigate()

  const [nativeItems, setNativeItems] = useState([])
  const { isAuthenticated, logout } = useAdminAuth()

  useEffect(() => {
    let cancelled = false
    if (!isAuthenticated) {
      setNativeItems([])
      return () => { cancelled = true }
    }
    loadNativeCollection({ includeFuture: 1 })
      .then((items) => {
        if (!cancelled) setNativeItems(Array.isArray(items) ? items : [])
      })
      .catch(() => {
        if (!cancelled) setNativeItems([])
      })
    return () => { cancelled = true }
  }, [isAuthenticated])
  const { isEditing, canSave, isConfigReady, changedFields, saveState, saveDraftToBackend } = usePublicEdit()
  const [canUseToolbar, setCanUseToolbar] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!isAuthenticated) {
      setCanUseToolbar(false)
      return () => { cancelled = true }
    }

    async function loadPermissions() {
      try {
        const snapshot = await getEditorPermissionsSnapshot()
        if (!cancelled) setCanUseToolbar(Boolean(snapshot?.canEditAnything))
      } catch {
        if (!cancelled) setCanUseToolbar(false)
      }
    }

    loadPermissions()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!canUseToolbar) return
    loadNativeCollection({ includeFuture: 1 }).then((items) => setNativeItems(Array.isArray(items) ? items : []))
  }, [canUseToolbar])

  const editPostLink = useMemo(() => {
    const postMatch = location.pathname.match(/^\/(post|piece)\/([^/]+)/)
    if (!postMatch) return ''
    const slug = postMatch[2]
    const found = nativeItems.find((item) => item.slug === slug)
    return found ? `${adminRoutes.nativeBridge}?edit=${found.id}` : ''
  }, [location.pathname, nativeItems])

  const editSiteLink = useMemo(() => {
    const params = new URLSearchParams(location.search)
    params.set('edit', 'site')
    return `${location.pathname}?${params.toString()}`
  }, [location.pathname, location.search])

  if (!isAuthenticated || !canUseToolbar || isEditing) return null

  async function handleLogout() {
    await logout()
    navigate('/login?loggedOut=1')
  }

  return (
    <div className="wp-public-admin-bar" role="navigation" aria-label="Editor toolbar">
      <div className="wp-public-admin-bar__left">
        <Link className="wp-public-admin-bar__item wp-public-admin-bar__brand" to="/" aria-label={`${siteTitle} home`}>
          <img src={mastheadLogo} alt={siteTitle} className="wp-public-admin-bar__brand-logo" />
        </Link>
        <Link className="wp-public-admin-bar__item" to={adminRoutes.dashboard}>Dashboard</Link>
        <Link className="wp-public-admin-bar__item" to={adminRoutes.addNew}>New</Link>
        <Link className="wp-public-admin-bar__item" to={adminRoutes.posts}>Posts</Link>
        <Link className="wp-public-admin-bar__item" to={adminRoutes.media}>Media</Link>
        <Link className="wp-public-admin-bar__item" to={adminRoutes.settings}>Settings</Link>
        {editPostLink ? <Link className="wp-public-admin-bar__item" to={editPostLink}>Edit Post</Link> : null}
        <Link className="wp-public-admin-bar__item" to={editSiteLink}>Edit Site</Link>
      </div>
      <div className="wp-public-admin-bar__right">
        <button className="wp-public-admin-bar__item" type="button" onClick={handleLogout}>Logout</button>
        {canSave && changedFields.length ? (
          <>
            <span className="wp-public-admin-bar__status">{changedFields.length} unsaved</span>
            <button
              className="wp-public-admin-bar__item"
              type="button"
              onClick={saveDraftToBackend}
              disabled={!isConfigReady || saveState === 'saving'}
            >
              {saveState === 'saving' ? 'Saving…' : isConfigReady ? 'Save Site' : 'Loading Site…'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
