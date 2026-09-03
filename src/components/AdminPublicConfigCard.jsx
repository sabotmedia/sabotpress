import { usePublicEdit } from './PublicEditContext'

function count(value, ready) {
  return ready ? value : '—'
}

export function AdminPublicConfigCard() {
  const {
    canSave,
    backendMode,
    changedFields,
    changedTextFields,
    changedStyleFields,
    draftStats,
    savedStats,
    effectiveStats,
    hasDraftChanges,
    loadState,
    saveState,
    loadError,
    saveError,
    permissionError,
    lastLoadedAt,
    lastSavedAt,
    saveDraftToBackend,
    reloadFromBackend,
    discardDraftAndReload,
  } = usePublicEdit()

  const backendReady = backendMode === 'd1' && loadState === 'loaded'
  const errors = [permissionError, loadError, saveError].filter(Boolean)

  return (
    <section className="admin-public-config-card" aria-labelledby="public-config-title">
      <div className="admin-public-config-card__header">
        <div>
          <div className="admin-public-config-card__eyebrow">Public site</div>
          <h2 id="public-config-title">Configuration</h2>
          <p className="description">
            Review and publish public-site text and style changes. Production saves are confirmed by the authenticated D1 API.
          </p>
        </div>
        <div className={`admin-public-config-card__health${backendReady ? ' is-ready' : ''}`}>
          <span className="admin-public-config-card__health-dot" aria-hidden="true" />
          {backendReady ? 'D1 connected' : loadState === 'loading' ? 'Loading D1' : 'D1 unavailable'}
        </div>
      </div>

      {errors.length ? (
        <div className="admin-public-config-card__error" role="alert">
          <strong>Configuration error</strong>
          <span>{errors[0]}</span>
        </div>
      ) : null}

      <div className="admin-public-config-card__status" aria-label="Configuration status">
        <span><small>Backend</small><strong>{backendMode}</strong></span>
        <span><small>Load</small><strong>{loadState}</strong></span>
        <span><small>Save</small><strong>{saveState}</strong></span>
        <span><small>Permission</small><strong>{canSave ? 'can save' : 'read only'}</strong></span>
      </div>

      <div className="admin-public-config-card__summary">
        <article>
          <span>Saved in D1</span>
          <strong>{count(savedStats.textCount + savedStats.styleCount + savedStats.blockCount, backendReady)}</strong>
          <small>{backendReady ? `${savedStats.textCount} text · ${savedStats.styleCount} styles · ${savedStats.blockCount} blocks` : 'Not loaded from production'}</small>
        </article>
        <article>
          <span>Draft changes</span>
          <strong>{draftStats.totalCount}</strong>
          <small>{changedTextFields.length} text · {changedStyleFields.length} styles</small>
        </article>
        <article>
          <span>Effective config</span>
          <strong>{effectiveStats.textCount + effectiveStats.styleCount + effectiveStats.blockCount}</strong>
          <small>{effectiveStats.textCount} text · {effectiveStats.styleCount} styles · {effectiveStats.blockCount} blocks</small>
        </article>
      </div>

      <div className="admin-public-config-card__meta">
        <span>Last D1 load <strong>{lastLoadedAt || 'not loaded'}</strong></span>
        <span>Last confirmed save <strong>{lastSavedAt || 'none this session'}</strong></span>
      </div>

      {changedFields.length ? (
        <details className="admin-public-config-card__changes">
          <summary>{changedFields.length} unsaved field{changedFields.length === 1 ? '' : 's'}</summary>
          <div>
            {changedFields.map((field) => <code key={field}>{field}</code>)}
          </div>
        </details>
      ) : (
        <p className="admin-public-config-card__clean">No unsaved configuration changes.</p>
      )}

      <div className="admin-public-config-card__actions">
        <button className="button" type="button" onClick={reloadFromBackend} disabled={loadState === 'loading'}>
          {loadState === 'loading' ? 'Reloading…' : 'Reload from D1'}
        </button>
        <button className="button" type="button" onClick={discardDraftAndReload} disabled={!hasDraftChanges}>
          Discard draft
        </button>
        <button
          className="button button--primary"
          type="button"
          onClick={saveDraftToBackend}
          disabled={!canSave || !hasDraftChanges || saveState === 'saving'}
        >
          {saveState === 'saving' ? 'Saving…' : 'Save changes to D1'}
        </button>
      </div>
    </section>
  )
}
