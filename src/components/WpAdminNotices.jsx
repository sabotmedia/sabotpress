import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AdminNoticeContext = createContext(null)

const NOTICE_TIMEOUT_MS = 6500

function makeNotice(message, type) {
  return {
    id: `notice-${Math.random().toString(36).slice(2, 10)}`,
    message: String(message || ''),
    type: type || 'info',
  }
}

export function AdminNoticeProvider({ children }) {
  const [notices, setNotices] = useState([])

  const dismissNotice = useCallback((id) => {
    setNotices((current) => current.filter((notice) => notice.id !== id))
  }, [])

  const pushNotice = useCallback((message, type = 'info') => {
    const notice = makeNotice(message, type)
    setNotices((current) => [notice, ...current])
    window.setTimeout(() => {
      setNotices((current) => current.filter((item) => item.id !== notice.id))
    }, NOTICE_TIMEOUT_MS)
    return notice.id
  }, [])

  const value = useMemo(() => ({ notices, pushNotice, dismissNotice }), [notices, pushNotice, dismissNotice])

  return <AdminNoticeContext.Provider value={value}>{children}</AdminNoticeContext.Provider>
}

export function useAdminNotices() {
  const value = useContext(AdminNoticeContext)
  if (!value) throw new Error('useAdminNotices must be used within <AdminNoticeProvider>')
  return value
}

export function WpAdminNotices() {
  const { notices, dismissNotice } = useAdminNotices()

  if (!notices.length) return null

  return (
    <div className="wp-admin-notices" role="status" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.id} className={`wp-notice wp-notice--${notice.type}`}>
          <p>{notice.message}</p>
          <button
            type="button"
            className="wp-notice__dismiss"
            aria-label="Dismiss notice"
            onClick={() => dismissNotice(notice.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
