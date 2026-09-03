import { useEffect, useMemo, useState } from 'react'
import { fetchTaxonomyTerms, fetchNativeTaxonomyLinks, saveNativeTaxonomyLinks } from '../lib/taxonomyApi'

export function NativeTaxonomyBridgeCard({ nativeContentId }) {
  const [terms, setTerms] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function boot() {
      if (!nativeContentId) {
        setTerms([])
        setSelectedIds([])
        return
      }

      try {
        setState('loading')
        setError('')
        const [termsData, linksData] = await Promise.all([
          fetchTaxonomyTerms(),
          fetchNativeTaxonomyLinks(nativeContentId),
        ])

        if (cancelled) return

        const nextTerms = Array.isArray(termsData?.items) ? termsData.items : []
        const nextLinks = Array.isArray(linksData?.items) ? linksData.items : []

        setTerms(nextTerms)
        setSelectedIds(nextLinks.map((item) => item.termId))
        setState('loaded')
      } catch (err) {
        if (cancelled) return
        setError(String(err?.message || err))
        setTerms([])
        setSelectedIds([])
        setState('error')
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [nativeContentId])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const term of terms) {
      const key = term.taxonomy || 'tag'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(term)
    }
    return [...map.entries()]
  }, [terms])

  function toggle(id) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id])
  }

  async function saveLinks() {
    try {
      setError('')
      setState('saving')
      await saveNativeTaxonomyLinks(nativeContentId, selectedIds)
      setState('saved')
    } catch (err) {
      setError(String(err?.message || err))
      setState('error')
    }
  }

  return (
    <section className="review-summary-card">
      <div className="review-summary-card__eyebrow">taxonomy bridge</div>
      <p className="review-card__excerpt">
        Attach reusable taxonomy terms to this native content entry so structure stops living only in freehand text fields and collective memory.
      </p>

      {error ? <p className="review-card__excerpt">{error}</p> : null}
      <p className="review-card__excerpt">status: {state}</p>

      <div className="native-taxonomy-groups">
        {grouped.map(([taxonomy, group]) => (
          <div className="native-taxonomy-group" key={taxonomy}>
            <strong>{taxonomy}</strong>
            <div className="native-taxonomy-chips">
              {group.map((term) => (
                <label className="native-taxonomy-chip" key={term.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(term.id)}
                    onChange={() => toggle(term.id)}
                  />
                  <span>{term.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {!grouped.length ? <p className="review-card__excerpt">No taxonomy terms yet. Create them first in the taxonomy admin page.</p> : null}
      </div>

      <div className="review-card__actions">
        <button className="button button--primary" type="button" onClick={saveLinks} disabled={!nativeContentId}>
          save taxonomy links
        </button>
      </div>
    </section>
  )
}
