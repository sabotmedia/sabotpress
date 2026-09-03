import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { isBrowserLocalRuntime } from '../lib/runtime'

function hasRecentBackup() {
  try {
    const raw = window.localStorage.getItem('sabotpress-last-backup-at')
    if (!raw) return false
    return Date.now() - new Date(raw).getTime() < 7 * 24 * 60 * 60 * 1000
  } catch { return false }
}

export function BrowserBackupReminder() {
  const location = useLocation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!isBrowserLocalRuntime()) return undefined
    let cancelled = false
    async function check() {
      if (hasRecentBackup()) { if (!cancelled) setShow(false); return }
      const [content, media] = await Promise.all([
        fetch('/api/native-content?includeFuture=1').then((r) => r.json()).catch(() => ({ items: [] })),
        fetch('/api/media-assets').then((r) => r.json()).catch(() => ({ items: [] })),
      ])
      if (!cancelled) setShow(Boolean(content?.items?.length || media?.items?.length))
    }
    check()
    const refresh = () => check()
    window.addEventListener('sabotpress:backup-created', refresh)
    window.addEventListener('sabotpress:portable-imported', refresh)
    return () => { cancelled = true; window.removeEventListener('sabotpress:backup-created', refresh); window.removeEventListener('sabotpress:portable-imported', refresh) }
  }, [location.pathname])

  if (!show || ['/welcome', '/publish-online'].includes(location.pathname)) return null
  return <aside className="browser-storage-warning" role="status"><strong>Your publication is stored in this browser.</strong> Clearing this site’s browser data can remove it. <Link to="/publish-online">Export a backup</Link>.</aside>
}
