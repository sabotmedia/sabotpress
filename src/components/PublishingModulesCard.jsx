import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PUBLISHING_MODULES,
  PUBLISHING_PRESETS,
  getPublishingSetup,
  hydratePublishingSetup,
  savePublishingSetup,
  setupFromPreset,
} from '../lib/publishingModules'

export function PublishingModulesCard({ onboarding = false, onComplete }) {
  const [setup, setSetup] = useState(() => getPublishingSetup())
  const [state, setState] = useState('idle')
  const [notice, setNotice] = useState('')
  const [logoState, setLogoState] = useState('idle')
  const [logoNotice, setLogoNotice] = useState('')
  const identitySaveTimer = useRef(null)

  useEffect(() => { hydratePublishingSetup().then(setSetup).catch(() => {}) }, [])
  useEffect(() => () => { if (identitySaveTimer.current) clearTimeout(identitySaveTimer.current) }, [])

  const presetMatches = useMemo(() => Object.entries(PUBLISHING_PRESETS).find(([, preset]) => (
    preset.modules.length === setup.modules.length && preset.modules.every((id) => setup.modules.includes(id))
  ))?.[0] || 'custom', [setup.modules])

  function choosePreset(id) {
    setSetup((current) => ({ ...setupFromPreset(id, current), preset: id }))
  }

  function toggleModule(id) {
    setSetup((current) => ({
      ...current,
      preset: 'custom',
      modules: current.modules.includes(id)
        ? current.modules.filter((item) => item !== id)
        : [...current.modules, id],
    }))
  }

  async function persist(nextSetup = setup, { completed = false, identityOnly = false } = {}) {
    setState('saving')
    setNotice('')
    try {
      const saved = await savePublishingSetup({
        ...nextSetup,
        preset: presetMatches,
        firstRunComplete: completed ? true : nextSetup.firstRunComplete,
      })
      setSetup(saved)
      setNotice(identityOnly ? 'Publication identity saved.' : 'Saved.')
      setState('saved')
      if (completed) onComplete?.(saved)
      return saved
    } catch (error) {
      setState('error')
      setNotice(String(error?.message || error))
      throw error
    }
  }

  function scheduleIdentitySave(nextSetup) {
    if (onboarding) return
    if (identitySaveTimer.current) clearTimeout(identitySaveTimer.current)
    identitySaveTimer.current = setTimeout(() => {
      persist(nextSetup, { identityOnly: true }).catch(() => {})
    }, 700)
  }

  function updateIdentity(field, value) {
    const nextSetup = { ...setup, identity: { ...setup.identity, [field]: value } }
    setSetup(nextSetup)
    scheduleIdentitySave(nextSetup)
  }

  async function uploadLogo(file) {
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      setLogoState('error')
      setLogoNotice('Choose an image file for the publication logo.')
      return
    }
    setLogoState('uploading')
    setLogoNotice('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('title', `${setup.identity.name || 'Publication'} logo`)
      form.append('role', 'publication-logo')
      const response = await fetch('/api/media/files', { method: 'POST', credentials: 'same-origin', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data?.ok === false) throw new Error(data.error || `Logo upload failed (${response.status})`)
      const media = data.media || data.asset || data.item || {}
      const url = String(media.publicUrl || media.url || media.downloadUrl || '')
      if (!url) throw new Error('Logo uploaded but no usable media URL was returned.')
      const nextSetup = { ...setup, identity: { ...setup.identity, logoUrl: url } }
      setSetup(nextSetup)
      await persist(nextSetup, { identityOnly: true })
      setLogoState('saved')
      setLogoNotice('Logo uploaded and saved.')
    } catch (error) {
      setLogoState('error')
      setLogoNotice(String(error?.message || error))
    }
  }

  async function save() {
    await persist(setup, { completed: onboarding })
  }

  return (
    <section className="wp-meta-box publishing-modules-card">
      <div className="wp-screen-header">
        <div>
          <h2>{onboarding ? 'Set up your publication' : 'Publishing tools'}</h2>
          <p className="description">Start small. You can turn more tools on later without reinstalling anything.</p>
        </div>
      </div>

      <div className="publishing-modules-card__identity">
        <label><strong>Publication name</strong><input value={setup.identity.name} onChange={(event) => updateIdentity('name', event.target.value)} placeholder="Your publication" /></label>
        <label><strong>Short description</strong><textarea rows="2" value={setup.identity.description} onChange={(event) => updateIdentity('description', event.target.value)} placeholder="What do you publish?" /></label>
        <label><strong>Logo URL <small>(optional)</small></strong><input value={setup.identity.logoUrl} onChange={(event) => updateIdentity('logoUrl', event.target.value)} onBlur={() => !onboarding && persist(setup, { identityOnly: true }).catch(() => {})} placeholder="https://…" /></label>
        <label><strong>Upload logo <small>(recommended)</small></strong><input type="file" accept="image/*" onChange={(event) => uploadLogo(event.target.files?.[0])} disabled={logoState === 'uploading'} /><small>{logoState === 'uploading' ? 'Uploading…' : 'PNG, JPG, WebP, SVG, or another browser-supported image.'}</small></label>
        {setup.identity.logoUrl ? <div className="publishing-modules-card__logo-preview"><img src={setup.identity.logoUrl} alt="Current publication logo" /><button type="button" className="button" onClick={() => updateIdentity('logoUrl', '')}>Remove logo</button></div> : null}
        <label><strong>Primary editor <small>(optional)</small></strong><input value={setup.identity.primaryEditor} onChange={(event) => updateIdentity('primaryEditor', event.target.value)} placeholder="Name or role" /></label>
      </div>

      {!onboarding ? (
        <div className="review-card__actions publishing-modules-card__identity-actions">
          <button type="button" className="button button--primary" onClick={() => persist(setup, { identityOnly: true })} disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save publication settings'}</button>
          <span className="description">Identity fields also save automatically after you stop typing.</span>
        </div>
      ) : null}
      {logoNotice ? <p className={logoState === 'error' ? 'notice notice--error' : 'description'}>{logoNotice}</p> : null}

      <div className="publishing-preset-row" role="group" aria-label="Publishing presets">
        {Object.entries(PUBLISHING_PRESETS).map(([id, preset]) => (
          <button type="button" key={id} className={`button${presetMatches === id ? ' button--primary' : ''}`} onClick={() => choosePreset(id)}>{preset.label}</button>
        ))}
        <button type="button" className={`button${presetMatches === 'custom' ? ' button--primary' : ''}`} onClick={() => setSetup({ ...setup, preset: 'custom' })}>Custom</button>
      </div>

      <div className="publishing-modules-card__list">
        {PUBLISHING_MODULES.map((module) => (
          <label key={module.id} className="publishing-modules-card__item">
            <input type="checkbox" checked={setup.modules.includes(module.id)} onChange={() => toggleModule(module.id)} />
            <span><strong>{module.label}</strong><small>{module.description}</small></span>
          </label>
        ))}
      </div>

      <div className="review-card__actions">
        <button type="button" className="button button--primary" onClick={save} disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : onboarding ? 'Finish setup' : 'Save publishing tools'}</button>
        {notice ? <span className={state === 'error' ? 'notice notice--error' : 'description'}>{notice}</span> : null}
      </div>
    </section>
  )
}
