import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminFrame } from './AdminRail'
import { createSiteDraft, deleteSite, loadSites, saveSite, SITE_STATUS_OPTIONS } from '../lib/siteDomains'
import { fetchDeploymentStatus } from '../lib/deploymentAdapter'
import { adminRoutes } from '../routing/routes'

const EMPTY_FORM = { name: '', domain: '', status: 'planned', notes: '' }

export function SitesAdminPage() {
  const [sites, setSites] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')
  const [deployment, setDeployment] = useState(null)

  async function reload() {
    try {
      setState('loading')
      setError('')
      const items = await loadSites()
      setSites(items)
      setState('loaded')
    } catch (err) {
      setSites([])
      setState('error')
      setError(String(err?.message || err))
    }
  }

  useEffect(() => { reload() }, [])

  const sortedSites = useMemo(() => [...sites].sort((a, b) => a.name.localeCompare(b.name)), [sites])

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    if (field === 'domain') setDeployment(null)
  }

  async function checkRequirements(hostname = form.domain) {
    if (!String(hostname || '').trim()) return
    try { setDeployment(await fetchDeploymentStatus(hostname)) } catch (err) { setError(String(err?.message || err)) }
  }

  async function addSite(event) {
    event.preventDefault()
    const draft = createSiteDraft(form)
    if (!draft.name.trim() || !draft.domain.trim()) return
    try {
      setError('')
      setSavingId(draft.id)
      const saved = await saveSite(draft)
      setSites((current) => [...current.filter((site) => site.id !== saved.id), saved])
      await checkRequirements(saved.domain)
      setForm(EMPTY_FORM)
    } catch (err) { setError(String(err?.message || err)) } finally { setSavingId('') }
  }

  function updateSiteLocal(id, field, value) { setSites((current) => current.map((site) => (site.id === id ? { ...site, [field]: value } : site))) }

  async function persistSite(site) {
    try {
      setError('')
      setSavingId(site.id)
      const saved = await saveSite(site)
      setSites((current) => current.map((item) => (item.id === saved.id ? saved : item)))
      await checkRequirements(saved.domain)
    } catch (err) { setError(String(err?.message || err)) } finally { setSavingId('') }
  }

  async function removeSite(site) {
    try {
      setError('')
      setSavingId(site.id)
      await deleteSite(site.id)
      setSites((current) => current.filter((item) => item.id !== site.id))
    } catch (err) { setError(String(err?.message || err)) } finally { setSavingId('') }
  }

  async function copy(value) {
    try { await navigator.clipboard.writeText(String(value || '')) } catch {}
  }

  return (
    <AdminFrame>
      <main className="page wp-admin-screen wp-sites-screen">
        <div className="wp-screen-header">
          <div><h1>Domain setup</h1><p className="description">Add the public address you want. SabotPress will show the DNS record your current host expects.</p></div>
          <Link className="button" to={adminRoutes.settings}>Back to Settings</Link>
        </div>

        {error ? <div className="notice notice-error" role="alert"><p><strong>Domain setup:</strong> {error}</p></div> : null}
        {state === 'loading' ? <div className="notice notice-info" role="status"><p>Loading domains…</p></div> : null}

        <section className="wp-meta-box">
          <h2>Connect a domain</h2>
          <p className="description">You can skip this until the publication is otherwise working. Enter a hostname such as <code>news.example.org</code>, not a full URL.</p>
          <form className="wp-settings-form wp-sites-form" onSubmit={addSite}>
            <label><span>Site name</span><input value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="My publication" required /></label>
            <label><span>Hostname</span><input value={form.domain} onChange={(e) => updateForm('domain', e.target.value)} placeholder="news.example.org" required /></label>
            <label><span>Status</span><select value={form.status} onChange={(e) => updateForm('status', e.target.value)}>{SITE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label><span>Notes <small>(optional)</small></span><textarea value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} placeholder="Who controls DNS, launch note…" /></label>
            <div className="review-card__actions"><button className="button" type="button" onClick={() => checkRequirements()} disabled={!form.domain}>Show DNS instructions</button><button className="button button--primary" type="submit" disabled={Boolean(savingId)}>Save hostname</button></div>
          </form>
        </section>

        {deployment ? <section className="wp-meta-box">
          <h2>DNS instructions</h2>
          <p className="description">Hosting provider: <strong>{deployment.provider}</strong>. Add exactly the record below at whichever service currently manages DNS for your domain.</p>
          {deployment.dns?.value ? <div className="content-table-wrap"><table className="content-table"><thead><tr><th>Type</th><th>Name</th><th>Value</th><th></th></tr></thead><tbody><tr><td><code>{deployment.dns.type}</code></td><td><code>{deployment.dns.name}</code></td><td><code>{deployment.dns.value}</code></td><td><button type="button" className="button" onClick={() => copy(deployment.dns.value)}>Copy value</button></td></tr></tbody></table></div> : <p>The host has not supplied a DNS target yet. Configure <code>SABOT_DEPLOYMENT_DNS_TARGET</code> on the deployment first.</p>}
          <p className="description">After DNS is accepted by the host, verify the domain and HTTPS there, then mark the hostname connected below.</p>
        </section> : null}

        <section className="wp-meta-box">
          <h2>Saved domains</h2>
          {state === 'loaded' && sortedSites.length === 0 ? <p className="description">No public domain is connected yet. That does not stop you from setting up the publication.</p> : null}
          {sortedSites.length ? <div className="content-table-wrap"><table className="content-table wp-posts-table"><thead><tr><th>Site</th><th>Hostname</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead><tbody>{sortedSites.map((site) => <tr key={site.id}><td><strong>{site.name}</strong></td><td><code>{site.domain}</code></td><td><select value={site.status} onChange={(e) => updateSiteLocal(site.id, 'status', e.target.value)}>{SITE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></td><td><textarea value={site.notes} onChange={(e) => updateSiteLocal(site.id, 'notes', e.target.value)} rows="2" /></td><td><div className="wp-row-actions"><button className="button" type="button" onClick={() => persistSite(site)} disabled={savingId === site.id}>{savingId === site.id ? 'Saving…' : 'Save'}</button><button className="button" type="button" onClick={() => checkRequirements(site.domain)}>DNS</button><button className="button button-link-delete" type="button" onClick={() => removeSite(site)} disabled={savingId === site.id}>Delete</button></div></td></tr>)}</tbody></table></div> : null}
        </section>
      </main>
    </AdminFrame>
  )
}
