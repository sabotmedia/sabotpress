import { useEffect, useMemo, useState } from 'react'
import { getStoredPublicConfig } from '../lib/publicConfig'
import { savePublicConfigPayload } from '../lib/publicConfigApi'
import { usePublicEdit } from './PublicEditContext'

const PAGE_GROUPS = [
  { id: 'about', label: 'About', prefix: 'info.about.' },
  { id: 'contact', label: 'Contact', prefix: 'info.contact.' },
  { id: 'submit', label: 'Submit work', prefix: 'info.submit.' },
  { id: 'support', label: 'Support', prefix: 'info.support.' },
  { id: 'security', label: 'Security', prefix: 'info.security.' },
]

function keysForPrefix(config, prefix) {
  return {
    text: Object.keys(config?.text || {}).filter((key) => key.startsWith(prefix)),
    styles: Object.keys(config?.styles || {}).filter((key) => key.startsWith(prefix)),
  }
}

function changedKeys(legacy, saved, prefix) {
  const keys = keysForPrefix(legacy, prefix)
  return {
    text: keys.text.filter((key) => legacy.text?.[key] !== saved?.text?.[key]),
    styles: keys.styles.filter((key) => JSON.stringify(legacy.styles?.[key] || {}) !== JSON.stringify(saved?.styles?.[key] || {})),
  }
}

function copyPrefix(target, source, prefix) {
  const next = {
    ...target,
    text: { ...(target?.text || {}) },
    styles: { ...(target?.styles || {}) },
    blocks: { ...(target?.blocks || {}) },
  }

  for (const [key, value] of Object.entries(source?.text || {})) {
    if (key.startsWith(prefix)) next.text[key] = value
  }
  for (const [key, value] of Object.entries(source?.styles || {})) {
    if (key.startsWith(prefix)) next.styles[key] = value
  }
  return next
}

export function LegacyInfoPageRecovery() {
  const { savedConfig, canSave, reloadFromBackend } = usePublicEdit()
  const [legacy, setLegacy] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setLegacy(getStoredPublicConfig())
  }, [])

  const groups = useMemo(() => PAGE_GROUPS.map((group) => {
    const differences = changedKeys(legacy, savedConfig, group.prefix)
    const total = differences.text.length + differences.styles.length
    const legacyKeys = keysForPrefix(legacy, group.prefix)
    return {
      ...group,
      differences,
      total,
      legacyTotal: legacyKeys.text.length + legacyKeys.styles.length,
    }
  }), [legacy, savedConfig])

  useEffect(() => {
    if (!legacy) return
    setSelected((current) => {
      if (current.size) return current
      return new Set(groups.filter((group) => group.total > 0 && group.id !== 'security').map((group) => group.id))
    })
  }, [legacy, groups])

  const selectedGroups = groups.filter((group) => selected.has(group.id) && group.total > 0)
  const recoverableCount = groups.reduce((sum, group) => sum + group.total, 0)

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function recover() {
    if (!legacy || !selectedGroups.length || !canSave) return
    try {
      setStatus('saving')
      setMessage('')
      let next = savedConfig || { text: {}, styles: {}, blocks: {} }
      for (const group of selectedGroups) next = copyPrefix(next, legacy, group.prefix)
      const result = await savePublicConfigPayload({ publicSite: next })
      if (!result?.saved) throw new Error('D1 did not confirm the recovered public-site config')
      await reloadFromBackend()
      setStatus('saved')
      setMessage(`Recovered ${selectedGroups.map((group) => group.label).join(', ')} into D1.`)
    } catch (error) {
      setStatus('error')
      setMessage(String(error?.message || error))
    }
  }

  if (!legacy) {
    return (
      <section className="review-card legacy-public-config-recovery">
        <h2>Legacy public page recovery</h2>
        <p className="description">This browser does not contain the old saved public-site cache. Open Settings in the desktop/browser where the newer info pages were previously visible.</p>
      </section>
    )
  }

  return (
    <section className="review-card legacy-public-config-recovery">
      <h2>Recover newer info pages from this browser</h2>
      <p className="description">
        This browser still contains the retired public-site cache. It is no longer allowed to control the live site, but its page copy can be promoted into D1 explicitly. Only the selected info-page fields are copied; the rest of the live D1 config is preserved.
      </p>

      <div className="legacy-public-config-recovery__grid">
        {groups.map((group) => (
          <label key={group.id} className={`legacy-public-config-recovery__item${group.total ? '' : ' is-current'}`}>
            <input
              type="checkbox"
              checked={selected.has(group.id)}
              onChange={() => toggle(group.id)}
              disabled={!group.total || status === 'saving'}
            />
            <span>
              <strong>{group.label}</strong>
              <small>
                {group.legacyTotal === 0
                  ? 'No legacy fields found in this browser'
                  : group.total === 0
                    ? 'Already matches D1'
                    : `${group.total} legacy field${group.total === 1 ? '' : 's'} differ from D1`}
              </small>
            </span>
          </label>
        ))}
      </div>

      <div className="review-card__actions">
        <button className="button button--primary" type="button" onClick={recover} disabled={!canSave || !selectedGroups.length || status === 'saving'}>
          {status === 'saving' ? 'Recovering…' : 'Recover selected pages to D1'}
        </button>
        <span className="description">{recoverableCount} differing legacy fields detected in this browser.</span>
      </div>

      {message ? <p className={status === 'error' ? 'notice notice-error' : 'notice notice-success'} role="status">{message}</p> : null}
    </section>
  )
}
