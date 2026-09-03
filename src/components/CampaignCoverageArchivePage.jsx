import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PublicationFooter } from './PublicationFooter'
import { PublicationTopbar } from './PublicationTopbar'
import { loadCampaignCoverage } from '../lib/campaignsApi'
import { EditableText } from './EditableText'
import { EditableLink } from './EditableLink'

const PAGE_SIZE = 24

export function CampaignCoverageArchivePage() {
  const [params, setParams] = useSearchParams()
  const [draftQuery, setDraftQuery] = useState(params.get('q') || '')
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const q = params.get('q') || ''
  const language = params.get('language') || ''
  const outlet = params.get('outlet') || ''
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1)

  useEffect(() => { setDraftQuery(q) }, [q])
  useEffect(() => {
    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: '' }))
    loadCampaignCoverage({ q, language, outlet, page, limit: PAGE_SIZE })
      .then((data) => { if (!cancelled) setState({ loading: false, error: '', data }) })
      .catch((error) => { if (!cancelled) setState({ loading: false, error: String(error?.message || error), data: null }) })
    return () => { cancelled = true }
  }, [q, language, outlet, page])

  function update(next) {
    const updated = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) updated.set(key, String(value))
      else updated.delete(key)
    }
    setParams(updated)
  }

  function search(event) {
    event.preventDefault()
    update({ q: draftQuery.trim(), page: '' })
  }

  const data = state.data
  return (
    <main className="page campaign-coverage-page">
      <PublicationTopbar />
      <header className="campaign-coverage-hero">
        <div className="campaign-coverage-shell">
          <EditableText as="p" field="campaign.coverage.hero.eyebrow">COMMUNICATIONS INFRASTRUCTURE IS NOT TERRORISM</EditableText>
          <EditableText as="h1" field="campaign.coverage.hero.title">Coverage archive</EditableText>
          <div className="campaign-coverage-hero__copy">
            <EditableText as="p" field="campaign.coverage.hero.description" multiline>A searchable record of reporting, analysis and official A/I dispatches connected to the designation and its consequences.</EditableText>
            <EditableLink labelField="campaign.coverage.hero.back.label" hrefField="campaign.coverage.hero.back.href" defaultLabel="← Return to the campaign hub" defaultHref="/campaigns/example-campaign" />
          </div>
        </div>
      </header>

      <section className="campaign-coverage-controls" aria-label="Filter coverage archive">
        <div className="campaign-coverage-shell">
          <form onSubmit={search}>
            <label htmlFor="coverage-search">Search the archive</label>
            <div><input id="coverage-search" type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Title, outlet or summary" /><button type="submit">Search</button></div>
          </form>
          <label>Language<select value={language} onChange={(event) => update({ language: event.target.value, page: '' })}><option value="">All languages</option>{(data?.facets?.languages || []).filter((item) => item.code).map((item) => <option key={item.code} value={item.code}>{item.label} ({item.count})</option>)}</select></label>
          <label>Outlet<select value={outlet} onChange={(event) => update({ outlet: event.target.value, page: '' })}><option value="">All outlets</option>{(data?.facets?.outlets || []).map((item) => <option key={item.label} value={item.label}>{item.label} ({item.count})</option>)}</select></label>
          {(q || language || outlet) ? <button className="campaign-coverage-clear" type="button" onClick={() => { setDraftQuery(''); setParams({}) }}>Clear filters</button> : null}
        </div>
      </section>

      <section className="campaign-coverage-results">
        <div className="campaign-coverage-shell">
          <div className="campaign-coverage-results__heading">
            <h2>{state.loading ? 'Loading coverage…' : `${data?.total || 0} archived item${data?.total === 1 ? '' : 's'}`}</h2>
            {data?.lastUpdatedAt ? <p>Archive updated {formatDate(data.lastUpdatedAt)}</p> : null}
          </div>
          {state.error ? <div className="campaign-coverage-error"><strong>Coverage archive unavailable</strong><p>{state.error}</p><Link to="/campaigns/example-campaign">The campaign hub remains available →</Link></div> : null}
          {!state.loading && !state.error && data?.items?.length === 0 ? <p className="campaign-coverage-empty">No coverage matches these filters.</p> : null}
          <div className="campaign-coverage-grid">
            {(data?.items || []).map((item) => <CoverageCard key={item.id || item.url} item={item} />)}
          </div>
          {data?.pages > 1 ? <nav className="campaign-coverage-pagination" aria-label="Coverage archive pages"><button type="button" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>← Newer</button><span>Page {page} of {data.pages}</span><button type="button" disabled={page >= data.pages} onClick={() => update({ page: page + 1 })}>Older →</button></nav> : null}
        </div>
      </section>
      <PublicationFooter />
    </main>
  )
}

function CoverageCard({ item }) {
  return <article className="campaign-coverage-card">
    {item.imageUrl ? <a className="campaign-coverage-card__image" href={item.url} target="_blank" rel="noreferrer"><img src={item.imageUrl} alt="" loading="lazy" /></a> : null}
    <div className="campaign-coverage-card__meta"><span>{item.outlet || 'Coverage'}</span><time dateTime={item.date}>{formatDate(item.date)}</time>{item.language ? <span>{item.language}</span> : null}</div>
    <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h2>
    {item.translatedTitle ? <p className="campaign-coverage-card__translation" lang="en">{item.translatedTitle}</p> : null}
    {item.summary ? <p>{item.summary}</p> : null}
    <a className="campaign-coverage-card__open" href={item.url} target="_blank" rel="noreferrer">Read at source ↗</a>
  </article>
}

function formatDate(value) {
  const date = new Date(value || 0)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
}
