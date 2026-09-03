import { useEffect, useMemo, useState } from 'react'
import { fetchTaxonomyTerms, saveTaxonomyTerm, removeTaxonomyTerm } from '../lib/taxonomyApi'
import { AdminFrame } from './AdminRail'

function emptyTerm() {
  return {
    id: '',
    label: '',
    slug: '',
    taxonomy: 'tag',
    description: '',
  }
}

function taxonomyLabel(value) {
  const labels = {
    tag: 'Tag',
    series: 'Series',
    theme: 'Theme',
    project: 'Project',
  }
  return labels[value] || value || 'Term'
}

export function TaxonomyAdminPage() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(emptyTerm())
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [filterTaxonomy, setFilterTaxonomy] = useState('all')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  async function reload() {
    try {
      setState('loading')
      setError('')
      const data = await fetchTaxonomyTerms(filterTaxonomy === 'all' ? {} : { taxonomy: filterTaxonomy })
      setItems(Array.isArray(data?.items) ? data.items : [])
      setState('loaded')
    } catch (err) {
      setError(String(err?.message || err))
      setItems([])
      setState('error')
    }
  }

  useEffect(() => {
    reload()
  }, [filterTaxonomy])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      [item.label, item.slug, item.taxonomy, item.description].join(' ').toLowerCase().includes(q)
    )
  }, [items, query])

  async function handleSave() {
    if (!String(form.label || '').trim()) {
      setError('A term label is required.')
      return
    }
    try {
      setSaving(true)
      setError('')
      await saveTaxonomyTerm(form)
      setForm(emptyTerm())
      await reload()
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      setDeletingId(id)
      setError('')
      await removeTaxonomyTerm(id)
      if (form.id === id) setForm(emptyTerm())
      await reload()
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setDeletingId('')
    }
  }

  return (
    <AdminFrame>
      <main className="page wp-admin-screen taxonomy-admin-page">
        <div className="wp-screen-header">
          <div>
            <h1>Taxonomy</h1>
            <p className="description">Manage the D1-backed tags, series, themes, and project terms used to organize Sabot content.</p>
          </div>
          <button className="button" type="button" onClick={reload} disabled={state === 'loading'}>
            {state === 'loading' ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <div className="notice notice-error" role="alert">
            <p><strong>Taxonomy operation failed:</strong> {error}</p>
          </div>
        ) : null}

        <section className="newsroom-grid">
          <article className="wp-meta-box newsroom-panel">
            <h2>{form.id ? 'Edit term' : 'Add term'}</h2>
            <p className="description">Changes are written to the taxonomy API and D1. Nothing on this screen is a browser-only placeholder.</p>

            <div className="native-content-editor__grid">
              <label className="native-content-editor__field">
                <span>Label</span>
                <input
                  type="text"
                  value={form.label}
                  onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="e.g. Rural Organizing"
                />
              </label>

              <label className="native-content-editor__field">
                <span>Slug</span>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                  placeholder="rural-organizing"
                />
              </label>

              <label className="native-content-editor__field">
                <span>Taxonomy</span>
                <select value={form.taxonomy} onChange={(event) => setForm((current) => ({ ...current, taxonomy: event.target.value }))}>
                  <option value="tag">Tag</option>
                  <option value="series">Series</option>
                  <option value="theme">Theme</option>
                  <option value="project">Project</option>
                </select>
              </label>
            </div>

            <label className="native-content-editor__field native-content-editor__field--plain">
              <span>Description</span>
              <textarea
                rows="5"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Optional editorial context for this term."
              />
            </label>

            <div className="review-card__actions">
              <button className="button button--primary" type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : form.id ? 'Update term' : 'Add term'}
              </button>
              <button className="button" type="button" onClick={() => setForm(emptyTerm())} disabled={saving}>Clear</button>
            </div>
          </article>

          <article className="wp-meta-box newsroom-panel">
            <div className="wp-screen-header wp-screen-header--compact">
              <div>
                <h2>Terms</h2>
                <p className="description">{visible.length} of {items.length} terms shown</p>
              </div>
            </div>

            <div className="native-content-editor__grid">
              <label className="native-content-editor__field">
                <span>Type</span>
                <select value={filterTaxonomy} onChange={(event) => setFilterTaxonomy(event.target.value)}>
                  <option value="all">All taxonomies</option>
                  <option value="tag">Tags</option>
                  <option value="series">Series</option>
                  <option value="theme">Themes</option>
                  <option value="project">Projects</option>
                </select>
              </label>

              <label className="native-content-editor__field">
                <span>Search</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search label, slug, or description"
                />
              </label>
            </div>

            <div className="content-table-wrap">
              <table className="content-table wp-posts-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Type</th>
                    <th scope="col">Slug</th>
                    <th scope="col">Description</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.label || 'Untitled term'}</strong></td>
                      <td>{taxonomyLabel(item.taxonomy)}</td>
                      <td><code>{item.slug || '—'}</code></td>
                      <td>{item.description || <span className="description">No description</span>}</td>
                      <td>
                        <div className="review-card__actions">
                          <button className="button" type="button" onClick={() => setForm(item)}>Edit</button>
                          <button
                            className="button button-link-delete"
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => handleDelete(item.id)}
                          >
                            {deletingId === item.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!visible.length ? (
                    <tr>
                      <td colSpan="5">{state === 'loading' ? 'Loading taxonomy…' : 'No terms match this view.'}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </main>
    </AdminFrame>
  )
}
