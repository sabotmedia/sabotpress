import { useLocation } from 'react-router-dom'
import { isBrowserLocalRuntime } from '../lib/runtime'

export function BrowserCapabilityNotice() {
  const { pathname } = useLocation()
  if (!isBrowserLocalRuntime()) return null
  const audio = pathname.includes('audiolab')
  const print = pathname.includes('printlab')
  if (!audio && !print) return null
  return (
    <aside className="browser-storage-warning browser-capability-note" role="note">
      <strong>This feature works best in the desktop edition.</strong>{' '}
      {audio
        ? 'Browser AudioLab remains available, but large audio files, long sessions, and direct filesystem work are more reliable in the desktop app.'
        : 'Browser PrintLab remains available, but large projects, direct filesystem access, and heavier export work are more reliable in the desktop app.'}
    </aside>
  )
}
