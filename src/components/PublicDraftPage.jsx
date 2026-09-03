import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { usePublicEdit } from './PublicEditContext'
import { CopyButton } from './CopyButton'
import { EditableText } from './EditableText'
import { buildPublicConfigPayload, buildChangedOnlyPayload } from '../lib/publicDraftExport'
import { savePublicConfigPayload } from '../lib/publicConfigApi'
import { useResolvedConfig } from '../lib/useResolvedConfig'
import { getConfiguredBlock, getConfiguredText } from '../lib/publicConfig'
import { validatePublicConfig } from '../lib/publicConfigSchema'
import { AdminFrame } from './AdminRail'
import { adminRoutes } from '../routing/routes'
import { publicPageRegistry, withSiteEdit } from '../lib/publicPageRegistry'

function unwrapImportedPayload(raw) {
  if (raw?.publicSite) return raw.publicSite
  if (raw?.config) return raw.config
  return raw
}

const SITE_SECTIONS = ['Masthead', 'Navigation', 'Homepage layout', 'Public surfaces']

export function PublicDraftPage() {
  const {
    draft,
    savedConfig,
    effectiveConfig,
    changedFields,
    changedTextFields,
    changedStyleFields,
    draftStats,
    savedStats,
    effectiveStats,
    hasDraftChanges,
    clearDraft,
    discardDraftAndReload,
    replaceDraftWithImported,
    importDraftPatch,
    loadState,
    saveState,
    loadError,
    saveError,
    canSave,
    permissionState,
    backendMode,
    lastLoadedAt,
    lastSavedAt,
    configVersion,
    schemaVersion,
  } = usePublicEdit()

  const resolvedConfig = useResolvedConfig()
  const heroBlock = getConfiguredBlock(resolvedConfig, 'draft.hero')
  const summaryBlock = getConfiguredBlock(resolvedConfig, 'draft.summary')
  const actionsBlock = getConfiguredBlock(resolvedConfig, 'draft.actions')
  const exportBlock = getConfiguredBlock(resolvedConfig, 'draft.export')

  const changedFieldsLabel = getConfiguredText(resolvedConfig, summaryBlock?.changedFieldsLabelField || 'draft.summary.changedFieldsLabel', 'changed fields')
  const actionsLabel = getConfiguredText(resolvedConfig, summaryBlock?.actionsLabelField || 'draft.summary.actionsLabel', 'actions')
  const emptyChanged = getConfiguredText(resolvedConfig, summaryBlock?.emptyChangedField || 'draft.summary.emptyChanged', 'No local changes yet.')
  const testSaveLabel = getConfiguredText(resolvedConfig, actionsBlock?.testSaveField || 'draft.action.testSave', 'test save')
  const clearDraftLabel = getConfiguredText(resolvedConfig, actionsBlock?.clearDraftField || 'draft.action.clearDraft', 'clear local draft')
  const savedLabel = getConfiguredText(resolvedConfig, exportBlock?.savedLabelField || 'draft.export.savedLabel', 'saved backend/base config')
  const effectiveLabel = getConfiguredText(resolvedConfig, exportBlock?.effectiveLabelField || 'draft.export.effectiveLabel', 'effective merged config')
  const changedOnlyLabel = getConfiguredText(resolvedConfig, exportBlock?.changedOnlyLabelField || 'draft.export.changedOnlyLabel', 'changed-only payload')
  const fullLabel = getConfiguredText(resolvedConfig, exportBlock?.fullLabelField || 'draft.export.fullLabel', 'full payload')
  const stateLabel = getConfiguredText(resolvedConfig, exportBlock?.stateLabelField || 'draft.export.stateLabel', 'state')
  const exportLabel = getConfiguredText(resolvedConfig, exportBlock?.exportLabelField || 'draft.export.exportLabel', 'export')

  const fullPayload = useMemo(() => buildPublicConfigPayload(draft), [draft])
  const changedPayload = useMemo(() => buildChangedOnlyPayload(draft), [draft])

  const savedJson = JSON.stringify(savedConfig || {}, null, 2)
  const effectiveJson = JSON.stringify(effectiveConfig || {}, null, 2)
  const changedJson = JSON.stringify(changedPayload, null, 2)
  const fullJson = JSON.stringify(fullPayload, null, 2)

  const [mockSaveState, setMockSaveState] = useState('idle')
  const [importText, setImportText] = useState('')
  const [importMode, setImportMode] = useState('merge-draft')
  const [importStatus, setImportStatus] = useState('')
  const [importErrors, setImportErrors] = useState([])
  const [importWarnings, setImportWarnings] = useState([])

  async function handleMockSave() {
    try {
      setMockSaveState('saving')
      await savePublicConfigPayload(fullPayload)
      setMockSaveState('saved')
      window.setTimeout(() => setMockSaveState('idle'), 1500)
    } catch {
      setMockSaveState('error')
      window.setTimeout(() => setMockSaveState('idle'), 2000)
    }
  }

  function handleImport(rawText) {
    setImportStatus('')
    setImportErrors([])
    setImportWarnings([])

    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch {
      setImportStatus('error')
      setImportErrors(['invalid JSON'])
      return
    }

    const unwrapped = unwrapImportedPayload(parsed)
    const result = validatePublicConfig(unwrapped)

    if (!result.ok) {
      setImportStatus('error')
      setImportErrors(result.errors || ['invalid config'])
      setImportWarnings(result.warnings || [])
      return
    }

    setImportWarnings(result.warnings || [])

    if (importMode === 'replace-draft') {
      replaceDraftWithImported(result.normalized)
      setImportStatus('replaced draft from imported config')
      return
    }

    importDraftPatch(result.normalized)
    setImportStatus('merged imported config into draft')
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setImportText(text)
    handleImport(text)
  }

  return (
    <AdminFrame>
      <main className="page public-draft-page">
        <section className="project-hero">
          <EditableText as="div" className="project-hero__eyebrow" field={heroBlock?.eyebrowField || 'draft.hero.eyebrow'}>
            wordpress-like entry screen
          </EditableText>
          <EditableText as="h1" field={heroBlock?.titleField || 'draft.hero.title'}>
            Site Editor
          </EditableText>
          <EditableText as="div" className="project-hero__description" field={heroBlock?.descriptionField || 'draft.hero.description'} multiline>
            Choose a public page to edit live or view on the site. Site-wide configuration lives under Settings, with advanced import/export tools below for developers.
          </EditableText>
          <div className="project-hero__meta">
            <span>{changedFields.length} {changedFieldsLabel}</span>
            <span>backend: {backendMode}</span>
            <span>v{configVersion}</span>
            <span>schema: {schemaVersion}</span>
            <span>load: {loadState}</span>
            <span>save: {saveState}</span>
            <span>perm: {permissionState}</span>
            <span>can save: {canSave ? 'yes' : 'no'}</span>
          </div>
        </section>

        <section className="review-summary-grid">
          <article className="review-summary-card">
            <div className="review-summary-card__eyebrow">Pages</div>
            <ul>
              {publicPageRegistry.map((page) => (
                <li key={page.path}>
                  <div>{page.label}</div>
                  <div className="review-card__actions">
                    <Link className="button button--primary" to={withSiteEdit(page.path)}>
                      Edit live
                    </Link>
                    <Link className="button" to={page.path}>
                      View
                    </Link>
                    <Link className="button" to={adminRoutes.settings}>
                      Site settings
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </article>

          <article className="review-summary-card">
            <div className="review-summary-card__eyebrow">Site sections</div>
            <ul>
              {SITE_SECTIONS.map((section) => (
                <li key={section}><span>{section}</span></li>
              ))}
            </ul>
          </article>
        </section>

        <details className="review-card">
          <summary><strong>Advanced / Developer Tools</strong></summary>

          <section className="review-summary-grid">
            <article className="review-summary-card">
              <div className="review-summary-card__eyebrow">{changedFieldsLabel}</div>
              {changedFields.length ? (
                <ul>
                  {changedFields.map((field) => (
                    <li key={field}><span>{field}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="review-card__excerpt">{emptyChanged}</p>
              )}
            </article>

            <article className="review-summary-card">
              <div className="review-summary-card__eyebrow">{actionsLabel}</div>
              <div className="review-card__actions">
                <button className="button button--primary" type="button" onClick={handleMockSave} disabled={!canSave || !hasDraftChanges}>
                  {mockSaveState === 'saving' ? 'saving...' : mockSaveState === 'saved' ? 'saved' : mockSaveState === 'error' ? 'save error' : testSaveLabel}
                </button>
                <button className="button" type="button" onClick={clearDraft} disabled={!hasDraftChanges}>{clearDraftLabel}</button>
                <button className="button" type="button" onClick={discardDraftAndReload} disabled={!hasDraftChanges}>discard + reload</button>
              </div>
            </article>
          </section>

          <section className="review-summary-grid">
            <article className="review-summary-card">
              <div className="review-summary-card__eyebrow">saved config stats</div>
              <ul>
                <li><span>text fields</span><strong>{savedStats.textCount}</strong></li>
                <li><span>style fields</span><strong>{savedStats.styleCount}</strong></li>
                <li><span>blocks</span><strong>{savedStats.blockCount}</strong></li>
              </ul>
            </article>

            <article className="review-summary-card">
              <div className="review-summary-card__eyebrow">draft overlay stats</div>
              <ul>
                <li><span>text changes</span><strong>{draftStats.textCount}</strong></li>
                <li><span>style changes</span><strong>{draftStats.styleCount}</strong></li>
                <li><span>total changed</span><strong>{draftStats.totalCount}</strong></li>
              </ul>
            </article>

            <article className="review-summary-card">
              <div className="review-summary-card__eyebrow">effective config stats</div>
              <ul>
                <li><span>text fields</span><strong>{effectiveStats.textCount}</strong></li>
                <li><span>style fields</span><strong>{effectiveStats.styleCount}</strong></li>
                <li><span>blocks</span><strong>{effectiveStats.blockCount}</strong></li>
              </ul>
            </article>

            <article className="review-summary-card">
              <div className="review-summary-card__eyebrow">change split</div>
              <ul>
                <li><span>changed text fields</span><strong>{changedTextFields.length}</strong></li>
                <li><span>changed style fields</span><strong>{changedStyleFields.length}</strong></li>
                <li><span>has draft changes</span><strong>{hasDraftChanges ? 'yes' : 'no'}</strong></li>
              </ul>
            </article>
          </section>

          <section className="review-summary-grid">
            <article className="review-summary-card public-import-card">
              <div className="review-summary-card__eyebrow">import config</div>

              <label className="archive-control">
                <span>import mode</span>
                <select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                  <option value="merge-draft">merge into draft</option>
                  <option value="replace-draft">replace draft</option>
                </select>
              </label>

              <label className="archive-control">
                <span>import file</span>
                <input type="file" accept=".json,application/json" onChange={handleImportFile} />
              </label>

              <label className="archive-control">
                <span>paste json</span>
                <textarea
                  className="public-import-card__textarea"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="paste exported public config or payload here"
                />
              </label>

              <div className="review-card__actions">
                <button className="button button--primary" type="button" onClick={() => handleImport(importText)}>
                  import json
                </button>
              </div>

              {importStatus ? <p className="review-card__excerpt">{importStatus}</p> : null}
              {importErrors.length ? (
                <ul className="public-import-card__messages public-import-card__messages--error">
                  {importErrors.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
              {importWarnings.length ? (
                <ul className="public-import-card__messages public-import-card__messages--warning">
                  {importWarnings.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </article>

            <article className="review-summary-card">
              <div className="review-summary-card__eyebrow">export helpers</div>
              <div className="review-card__actions">
                <CopyButton text={changedJson} />
                <CopyButton text={fullJson} />
                <CopyButton text={effectiveJson} />
                <CopyButton text={savedJson} />
              </div>
            </article>
          </section>

          <section className="review-queue">
            <article className="review-card">
              <div className="review-card__meta">
                <span>{stateLabel}</span>
                <span>{savedLabel}</span>
              </div>
              <pre className="review-card__snippet">{savedJson}</pre>
            </article>

            <article className="review-card">
              <div className="review-card__meta">
                <span>{stateLabel}</span>
                <span>{effectiveLabel}</span>
              </div>
              <pre className="review-card__snippet">{effectiveJson}</pre>
            </article>

            <article className="review-card">
              <div className="review-card__meta">
                <span>{exportLabel}</span>
                <span>{changedOnlyLabel}</span>
              </div>
              <pre className="review-card__snippet">{changedJson}</pre>
            </article>

            <article className="review-card">
              <div className="review-card__meta">
                <span>{exportLabel}</span>
                <span>{fullLabel}</span>
              </div>
              <pre className="review-card__snippet">{fullJson}</pre>
            </article>
          </section>

          {lastLoadedAt ? <p className="review-card__excerpt">last loaded: {lastLoadedAt}</p> : null}
          {lastSavedAt ? <p className="review-card__excerpt">last saved: {lastSavedAt}</p> : null}
          {loadError ? <p className="review-card__excerpt">{loadError}</p> : null}
          {saveError ? <p className="review-card__excerpt">{saveError}</p> : null}
        </details>
      </main>
    </AdminFrame>
  )
}
