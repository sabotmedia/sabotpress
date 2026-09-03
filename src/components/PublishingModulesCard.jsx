import { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => { hydratePublishingSetup().then(setSetup).catch(() => {}) }, [])

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

  async function save() {
    setState('saving')
    setNotice('')
    try {
      const saved = await savePublishingSetup({
        ...setup,
        preset: presetMatches,
        firstRunComplete: onboarding ? true : setup.firstRunComplete,
      })
      setSetup(saved)
      setNotice('Saved for every editor on this site.')
      setState('saved')
      onComplete?.(saved)
    } catch (error) {
      setState('error')
      setNotice(String(error?.message || error))
    }
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
        <label><strong>Publication name</strong><input value={setup.identity.name} onChange={(event) => setSetup({ ...setup, identity: { ...setup.identity, name: event.target.value } })} placeholder="Your publication" /></label>
        <label><strong>Short description</strong><textarea rows="2" value={setup.identity.description} onChange={(event) => setSetup({ ...setup, identity: { ...setup.identity, description: event.target.value } })} placeholder="What do you publish?" /></label>
        <label><strong>Logo URL <small>(optional)</small></strong><input value={setup.identity.logoUrl} onChange={(event) => setSetup({ ...setup, identity: { ...setup.identity, logoUrl: event.target.value } })} placeholder="https://…" /></label>
        <label><strong>Primary editor <small>(optional)</small></strong><input value={setup.identity.primaryEditor} onChange={(event) => setSetup({ ...setup, identity: { ...setup.identity, primaryEditor: event.target.value } })} placeholder="Name or role" /></label>
      </div>

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
