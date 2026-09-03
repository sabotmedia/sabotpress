import { useEffect, useState } from 'react'
import { loadCampaignCoverage, updateCampaignCoverageEditorial } from '../lib/campaignsApi'

const FILTERS = [
  ['all', 'All'], ['featured', 'Featured'], ['automatic', 'Automatic'], ['hidden', 'Hidden'],
]

export function CampaignCoverageModeration({ campaignSlug, onNotice }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [state, setState] = useState({ loading: true, items: [], total: 0, error: '' })
  const [notes, setNotes] = useState({})
  const [savingId, setSavingId] = useState('')

  useEffect(() => {
    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: '' }))
    loadCampaignCoverage({ campaign: campaignSlug, admin: true, editorialStatus: filter, q: submittedQuery, limit: 500 })
      .then((data) => {
        if (cancelled) return
        setState({ loading: false, items: data.items, total: data.total, error: '' })
        setNotes(Object.fromEntries(data.items.map((item) => [item.id, item.editorialNote || ''])))
      })
      .catch((error) => { if (!cancelled) setState({ loading: false, items: [], total: 0, error: String(error?.message || error) }) })
    return () => { cancelled = true }
  }, [campaignSlug, filter, submittedQuery])

  async function moderate(item, editorialStatus) {
    try {
      setSavingId(item.id)
      const saved = await updateCampaignCoverageEditorial({ id: item.id, campaign: campaignSlug, editorialStatus, editorialNote: notes[item.id] || '' })
      setState((current) => {
        const items = current.items.map((entry) => entry.id === saved.id ? saved : entry)
        return filter === 'all' || filter === saved.editorialStatus
          ? { ...current, items }
          : { ...current, items: items.filter((entry) => entry.id !== saved.id), total: Math.max(0, current.total - 1) }
      })
      onNotice?.(`Coverage is now ${editorialStatus === 'automatic' ? 'public in the automated feed' : editorialStatus}.`, 'success')
    } catch (error) {
      onNotice?.(`Coverage moderation failed: ${String(error?.message || error)}`, 'error')
    } finally { setSavingId('') }
  }

  function search(event) {
    event.preventDefault()
    setSubmittedQuery(query.trim())
  }

  return <section className="wp-meta-box campaign-coverage-moderation">
    <div className="campaign-admin-section-header"><div><h2>Coverage Moderation</h2><p className="description">Automated discovery remains archived here. Editorial status controls only what appears publicly.</p></div><span className="description">{state.total} item{state.total === 1 ? '' : 's'}</span></div>
    <div className="campaign-coverage-moderation__tools">
      <div className="campaign-coverage-moderation__filters" role="group" aria-label="Coverage editorial status">{FILTERS.map(([value, label]) => <button key={value} type="button" className={`button${filter === value ? ' button--primary' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <form onSubmit={search}><label className="screen-reader-text" htmlFor="campaign-coverage-admin-search">Search coverage</label><input id="campaign-coverage-admin-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, outlet or summary" /><button className="button" type="submit">Search</button></form>
    </div>
    {state.loading ? <p className="description">Loading archived coverage from D1…</p> : null}
    {state.error ? <p className="notice notice-error">{state.error}</p> : null}
    {!state.loading && !state.error && !state.items.length ? <p className="description">No coverage matches this view.</p> : null}
    <div className="campaign-coverage-moderation__list">{state.items.map((item) => <article className="campaign-coverage-moderation__item" key={item.id}>
      <div className="campaign-coverage-moderation__item-head"><div><span className={`campaign-coverage-status campaign-coverage-status--${item.editorialStatus}`}>{item.editorialStatus}</span><strong>{item.title}</strong><p>{[item.outlet, formatDate(item.date), item.discoverySource].filter(Boolean).join(' · ')}</p></div><a href={item.url} target="_blank" rel="noreferrer">Open source ↗</a></div>
      {item.summary ? <p className="campaign-coverage-moderation__summary">{item.summary}</p> : null}
      <label className="native-content-editor__field"><span>Private editorial note</span><textarea value={notes[item.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
      <div className="campaign-admin-row__actions">
        <button className="button" type="button" disabled={savingId === item.id || item.editorialStatus === 'featured'} onClick={() => moderate(item, 'featured')}>Feature</button>
        <button className="button" type="button" disabled={savingId === item.id || item.editorialStatus === 'automatic'} onClick={() => moderate(item, 'automatic')}>Show publicly</button>
        <button className="button button-link-delete" type="button" disabled={savingId === item.id || item.editorialStatus === 'hidden'} onClick={() => moderate(item, 'hidden')}>Hide from public feed</button>
        {item.editorialStatus === 'hidden' ? <button className="button" type="button" disabled={savingId === item.id} onClick={() => moderate(item, 'automatic')}>Restore</button> : null}
        <button className="button" type="button" disabled={savingId === item.id} onClick={() => moderate(item, item.editorialStatus)}>{savingId === item.id ? 'Saving…' : 'Save note'}</button>
      </div>
      {item.reviewedAt ? <small>Last reviewed {formatDateTime(item.reviewedAt)}{item.reviewedBy ? ` by ${item.reviewedBy}` : ''}</small> : null}
    </article>)}</div>
  </section>
}

function formatDate(value) {
  const date = new Date(value || 0)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : ''
}
function formatDateTime(value) {
  const date = new Date(value || 0)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : ''
}
