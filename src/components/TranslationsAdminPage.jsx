import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { loadNativeCollection } from '../lib/nativePublicContent'
import {
  deleteNativeTranslation,
  exportWeblateSource,
  loadNativeTranslations,
  saveNativeTranslation,
  unwrapWeblateBundle,
} from '../lib/nativeTranslationsApi'
import { adminRoutes } from '../routing/routes'

const STATUSES = ['draft', 'in_review', 'approved', 'published', 'archived']
const DEFAULT_WEBLATE_URL = 'https://hosted.weblate.org/projects/sabotpress/ai-server-called-paranoia/'
const KNOWN_AI_EXTERNAL_TRANSLATIONS = [
  {
    languageCode: 'es',
    languageLabel: 'Español',
    externalUrl: 'https://babelicosas.sutty.nl/2026/08/29/a-i-el-servidor-llamado-paranoia/',
    translatorCredit: 'Dazibao translation',
  },
  {
    languageCode: 'fr',
    languageLabel: 'Français',
    externalUrl: 'https://nantes.indymedia.org/posts/168508/example-campaign-designe-organisation-terroriste-internationale-par-les-etats-unis/',
    translatorCredit: 'Collective translation via Indymedia Nantes',
  },
  {
    languageCode: 'de',
    languageLabel: 'Deutsch',
    externalUrl: 'https://barrikade.info/article/7678',
    translatorCredit: 'German translation via Barrikade',
  },
]

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}

function labelForLanguage(code = '') {
  const known = { es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português', ar: 'العربية' }
  return known[String(code).toLowerCase()] || String(code || '').toUpperCase()
}

export function TranslationsAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [content, setContent] = useState([])
  const [activeSlug, setActiveSlug] = useState(searchParams.get('slug') || 'the-server-called-paranoia')
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importMeta, setImportMeta] = useState({ languageCode: 'it', languageLabel: 'Italiano', translatorCredit: '', reviewerCredit: '', weblateUrl: DEFAULT_WEBLATE_URL })
  const [external, setExternal] = useState({ languageCode: '', languageLabel: '', externalUrl: '', translatorCredit: '', status: 'published' })

  const activeContent = useMemo(() => content.find((item) => item.slug === activeSlug) || null, [content, activeSlug])
  const translations = Array.isArray(data?.translations) ? data.translations : []

  useEffect(() => {
    let cancelled = false
    loadNativeCollection({ includeFuture: 1 }).then((items) => {
      if (cancelled) return
      setContent(Array.isArray(items) ? items.filter((item) => item?.slug) : [])
    }).catch(() => { if (!cancelled) setContent([]) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!activeSlug) return
    let cancelled = false
    setState('loading')
    setError('')
    loadNativeTranslations({ slug: activeSlug, includeUnpublished: true })
      .then((next) => { if (!cancelled) { setData(next); setState('loaded') } })
      .catch((err) => { if (!cancelled) { setError(String(err?.message || err)); setState('error') } })
    return () => { cancelled = true }
  }, [activeSlug])

  function selectSlug(slug) {
    setActiveSlug(slug)
    setSearchParams(slug ? { slug } : {})
    setNotice('')
  }

  async function refresh() {
    if (!activeSlug) return
    const next = await loadNativeTranslations({ slug: activeSlug, includeUnpublished: true })
    setData(next)
    return next
  }

  async function handleSourceExport() {
    try {
      setError('')
      const bundle = await exportWeblateSource({ slug: activeSlug })
      downloadJson(`${activeSlug || 'article'}-en.json`, bundle)
      setNotice('Downloaded the current English Weblate source bundle from D1.')
    } catch (err) { setError(String(err?.message || err)) }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setError('')
      setNotice('')
      const parsed = JSON.parse(await file.text())
      const bundle = unwrapWeblateBundle(parsed)
      const languageCode = String(importMeta.languageCode || '').trim().toLowerCase()
      if (!languageCode || languageCode === 'en') throw new Error('Choose the translated language code before importing')
      await saveNativeTranslation({
        translation: {
          slug: activeSlug,
          languageCode,
          languageLabel: importMeta.languageLabel || labelForLanguage(languageCode),
          status: 'in_review',
          provider: 'weblate',
          translatorCredit: importMeta.translatorCredit,
          reviewerCredit: importMeta.reviewerCredit,
          weblateUrl: importMeta.weblateUrl,
        },
        weblateBundle: bundle,
      })
      await refresh()
      setNotice(`${file.name} imported as ${languageCode} and placed in editorial review. It is not public yet.`)
    } catch (err) { setError(String(err?.message || err)) }
  }

  async function handleExternalSubmit(event) {
    event.preventDefault()
    try {
      setError('')
      const languageCode = String(external.languageCode || '').trim().toLowerCase()
      if (!languageCode || !external.externalUrl) throw new Error('Language code and external translation URL are required')
      await saveNativeTranslation({
        slug: activeSlug,
        languageCode,
        languageLabel: external.languageLabel || labelForLanguage(languageCode),
        status: external.status,
        provider: 'external',
        translatorCredit: external.translatorCredit,
        externalUrl: external.externalUrl,
      })
      await refresh()
      setExternal({ languageCode: '', languageLabel: '', externalUrl: '', translatorCredit: '', status: 'published' })
      setNotice('External translation registered. Attribution and original hosting are preserved.')
    } catch (err) { setError(String(err?.message || err)) }
  }

  async function registerKnownAiTranslations() {
    if (activeSlug !== 'the-server-called-paranoia') return
    try {
      setError('')
      for (const item of KNOWN_AI_EXTERNAL_TRANSLATIONS) {
        await saveNativeTranslation({
          slug: activeSlug,
          ...item,
          status: 'published',
          provider: 'external',
        })
      }
      await refresh()
      setNotice('Registered the existing Spanish, French, and German community translations in D1 with their original hosting and credits preserved.')
    } catch (err) { setError(String(err?.message || err)) }
  }

  async function updateStatus(item, status) {
    try {
      setError('')
      await saveNativeTranslation({
        translation: {
          slug: activeSlug,
          languageCode: item.code,
          languageLabel: item.label,
          status,
          provider: item.provider,
          translatorCredit: item.credit,
          weblateUrl: item.weblateUrl,
          externalUrl: item.provider === 'external' ? item.href : '',
          translation: item.translation,
        },
      })
      await refresh()
      setNotice(`${item.label || item.code} moved to ${status.replace('_', ' ')}.`)
    } catch (err) { setError(String(err?.message || err)) }
  }

  async function remove(item) {
    if (!data?.content?.id || !window.confirm(`Delete the ${item.label || item.code} translation record?`)) return
    try {
      await deleteNativeTranslation({ contentId: data.content.id, languageCode: item.code })
      await refresh()
      setNotice(`${item.label || item.code} translation record deleted.`)
    } catch (err) { setError(String(err?.message || err)) }
  }

  return (
    <AdminFrame>
      <main className="page wp-admin-screen translations-admin-page">
        <div className="wp-screen-header">
          <div>
            <h1>Translations</h1>
            <p className="description">Weblate is the collaboration workspace. Sabot remains the publication authority: import finished language files here, review them, and explicitly publish them to the article language selector.</p>
          </div>
          <div className="review-card__actions">
            {activeSlug ? <a className="button" href={`/post/${encodeURIComponent(activeSlug)}`} target="_blank" rel="noreferrer">Open Article</a> : null}
            <a className="button" href={importMeta.weblateUrl || DEFAULT_WEBLATE_URL} target="_blank" rel="noreferrer">Open Weblate</a>
          </div>
        </div>

        {error ? <div className="notice notice-error" role="alert"><p><strong>Translation error:</strong> {error}</p></div> : null}
        {notice ? <div className="notice notice-success" role="status"><p>{notice}</p></div> : null}

        <section className="wp-meta-box">
          <h2>Article</h2>
          <label className="admin-field"><span>Manage translations for</span>
            <select value={activeSlug} onChange={(event) => selectSlug(event.target.value)}>
              {content.map((item) => <option key={item.id || item.slug} value={item.slug}>{item.title || item.slug}</option>)}
            </select>
          </label>
          {activeContent ? <p className="description"><code>/post/{activeContent.slug}</code> · {activeContent.status || 'unknown status'}</p> : null}
        </section>

        <section className="wp-meta-box">
          <div className="wp-screen-header">
            <div><h2>Weblate workflow</h2><p className="description">Export English when the source changes. When a translator finishes a language in Weblate, download that language JSON and import it below. Imports always begin in review, never directly on the public site.</p></div>
            <button className="button" type="button" onClick={handleSourceExport} disabled={!activeSlug}>Download current English source</button>
          </div>
          <div className="form-grid form-grid--two">
            <label className="admin-field"><span>Language code</span><input value={importMeta.languageCode} onChange={(e) => setImportMeta((v) => ({ ...v, languageCode: e.target.value }))} placeholder="it" /></label>
            <label className="admin-field"><span>Language label</span><input value={importMeta.languageLabel} onChange={(e) => setImportMeta((v) => ({ ...v, languageLabel: e.target.value }))} placeholder="Italiano" /></label>
            <label className="admin-field"><span>Translator credit</span><input value={importMeta.translatorCredit} onChange={(e) => setImportMeta((v) => ({ ...v, translatorCredit: e.target.value }))} placeholder="Name, collective, or community translation" /></label>
            <label className="admin-field"><span>Reviewer credit</span><input value={importMeta.reviewerCredit} onChange={(e) => setImportMeta((v) => ({ ...v, reviewerCredit: e.target.value }))} placeholder="Optional" /></label>
          </div>
          <label className="admin-field"><span>Weblate component URL</span><input value={importMeta.weblateUrl} onChange={(e) => setImportMeta((v) => ({ ...v, weblateUrl: e.target.value }))} /></label>
          <label className="button button--primary" style={{ display: 'inline-block', cursor: 'pointer' }}>Import translated JSON<input type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: 'none' }} /></label>
        </section>

        <section className="wp-meta-box">
          <div className="wp-screen-header">
            <div><h2>Existing translations hosted elsewhere</h2><p className="description">Keep community translations on the translator's original site unless they explicitly want their work moved into Weblate under this project's translation license. Sabot can register the original URL and credit without republishing the text.</p></div>
            {activeSlug === 'the-server-called-paranoia' ? <button className="button" type="button" onClick={registerKnownAiTranslations}>Register known ES / FR / DE translations</button> : null}
          </div>
          <form onSubmit={handleExternalSubmit}>
            <div className="form-grid form-grid--two">
              <label className="admin-field"><span>Language code</span><input value={external.languageCode} onChange={(e) => setExternal((v) => ({ ...v, languageCode: e.target.value }))} placeholder="es" /></label>
              <label className="admin-field"><span>Language label</span><input value={external.languageLabel} onChange={(e) => setExternal((v) => ({ ...v, languageLabel: e.target.value }))} placeholder="Español" /></label>
              <label className="admin-field"><span>Translation URL</span><input value={external.externalUrl} onChange={(e) => setExternal((v) => ({ ...v, externalUrl: e.target.value }))} placeholder="https://…" /></label>
              <label className="admin-field"><span>Credit</span><input value={external.translatorCredit} onChange={(e) => setExternal((v) => ({ ...v, translatorCredit: e.target.value }))} placeholder="Translator or host" /></label>
            </div>
            <button className="button" type="submit">Register external translation</button>
          </form>
        </section>

        <section className="wp-meta-box">
          <div className="wp-screen-header"><div><h2>Editorial translation records</h2><p className="description">Published native translations appear at <code>?lang=xx</code>. External translations keep linking to their original host.</p></div><button className="button" type="button" onClick={refresh} disabled={state === 'loading'}>Refresh</button></div>
          {state === 'loading' ? <p>Loading translations…</p> : null}
          <div className="wp-list-table-wrap">
            <table className="content-table wp-posts-table">
              <thead><tr><th>Language</th><th>Provider</th><th>Status</th><th>Credit</th><th>Destination</th><th>Actions</th></tr></thead>
              <tbody>
                {translations.length ? translations.map((item) => (
                  <tr key={item.code}>
                    <td><strong>{item.label || item.code}</strong><div className="description"><code>{item.code}</code></div></td>
                    <td>{item.provider || 'manual'}</td>
                    <td><span className={`status-badge status-badge--${String(item.status || 'draft').replace('_', '-')}`}>{String(item.status || 'draft').replace('_', ' ')}</span></td>
                    <td>{item.credit || '—'}</td>
                    <td>{item.href ? <a href={item.href} target="_blank" rel="noreferrer">Open translation</a> : item.weblateUrl ? <a href={item.weblateUrl} target="_blank" rel="noreferrer">Open Weblate</a> : '—'}</td>
                    <td><div className="review-card__actions">
                      {STATUSES.filter((status) => status !== item.status).map((status) => <button key={status} className={status === 'published' ? 'button button--primary' : 'button'} type="button" onClick={() => updateStatus(item, status)}>{status === 'published' ? 'Publish' : status.replace('_', ' ')}</button>)}
                      <button className="button" type="button" onClick={() => remove(item)}>Delete</button>
                    </div></td>
                  </tr>
                )) : <tr><td colSpan={6}>No D1 translation records yet. The A/I article still has its legacy external language links on the public page until they are registered here.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="wp-meta-box"><h2>Where this fits</h2><p className="description">Write/edit the English source in <Link to={`${adminRoutes.nativeBridge}?edit=${encodeURIComponent(data?.content?.id || '')}`}>Posts</Link>. Translate collaboratively in Weblate. Import and review here. Publishing a translation makes it available through the public language selector without creating a duplicate post.</p></section>
      </main>
    </AdminFrame>
  )
}
