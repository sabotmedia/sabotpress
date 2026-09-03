import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { mergePublicConfig } from '../lib/publicConfig'
import { getPublicConfigPermissions, loadPublicConfigPayload, savePublicConfigPayload } from '../lib/publicConfigApi'
import { buildPublicConfigPayload } from '../lib/publicDraftExport'
import { normalizePublicConfig } from '../lib/publicConfigSchema'
import { useAdminAuth } from './AdminAuthContext'

const STORAGE_KEY = 'sabot-public-edit-draft-v2'
const PublicEditContext = createContext(null)

function emptyConfig() {
  return { text: {}, styles: {}, blocks: {} }
}

function emptyDraft() {
  return { text: {}, styles: {} }
}

function toDraftShape(config) {
  return {
    text: config?.text || {},
    styles: config?.styles || {},
  }
}

export function PublicEditProvider({ children }) {
  const [isEditing, setIsEditing] = useState(false)
  const { isAuthenticated } = useAdminAuth()
  const isAdmin = isAuthenticated
  const [canSave, setCanSave] = useState(false)
  const [backendMode, setBackendMode] = useState('unknown')
  const [selectedField, setSelectedField] = useState(null)

  // D1 is the only published source of truth. A legacy browser cache must not
  // become the initial rendered site configuration, even briefly.
  const [savedConfig, setSavedConfig] = useState(() => emptyConfig())
  const [draft, setDraft] = useState(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : emptyDraft()
    } catch {
      return emptyDraft()
    }
  })
  const draftRef = useRef(draft)

  const [loadState, setLoadState] = useState('idle')
  const [saveState, setSaveState] = useState('idle')
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [permissionState, setPermissionState] = useState('idle')
  const [permissionError, setPermissionError] = useState('')

  const [lastLoadedAt, setLastLoadedAt] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState('')
  const [configVersion, setConfigVersion] = useState(1)
  const [schemaVersion, setSchemaVersion] = useState(2)

  useEffect(() => {
    draftRef.current = draft
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    } catch {
      // ignore
    }
  }, [draft])

  function setDraftSnapshot(updater) {
    const previous = draftRef.current || emptyDraft()
    const next = typeof updater === 'function' ? updater(previous) : updater
    draftRef.current = next
    setDraft(next)
  }

  function hasPendingDraftChanges() {
    const current = draftRef.current || emptyDraft()
    return Boolean(Object.keys(current.text || {}).length || Object.keys(current.styles || {}).length)
  }

  async function reloadFromBackend() {
    try {
      setLoadState('loading')
      setLoadError('')
      const data = await loadPublicConfigPayload()
      const config = data?.config || emptyConfig()
      setSavedConfig(config)
      setBackendMode(data?.mode || 'unknown')
      setLastLoadedAt(data?.updatedAt || new Date().toISOString())
      setConfigVersion(Number(data?.version || 1))
      setSchemaVersion(Number(data?.schemaVersion || 2))
      setLoadState('loaded')
    } catch (error) {
      setLoadState('error')
      setLoadError(String(error?.message || error))
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setCanSave(false)
      setPermissionState('idle')
      setPermissionError('')
      reloadFromBackend()
      return
    }

    let cancelled = false

    async function boot() {
      try {
        setPermissionState('loading')
        setPermissionError('')
        const permissionData = await getPublicConfigPermissions()

        if (!cancelled) {
          setCanSave(permissionData?.canEdit === true)
          setBackendMode(permissionData?.mode || 'unknown')
          setPermissionState('loaded')
        }
      } catch (error) {
        if (!cancelled) {
          setPermissionState('error')
          setPermissionError(String(error?.message || error))
          setCanSave(false)
          setBackendMode('unknown')
        }
      }

      if (!cancelled) {
        await reloadFromBackend()
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  useEffect(() => {
    if (isAdmin) return
    setIsEditing(false)
    setSelectedField(null)
  }, [isAdmin])

  useEffect(() => {
    function handleKeyDown(e) {
      const active = document.activeElement
      const isTextInput = active?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName)
      if (isTextInput) return

      if (e.key === 'Escape') {
        setSelectedField(null)
        setIsEditing(false)
      }
    }

    if (isEditing) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isEditing])

  const changedTextFields = useMemo(() => Object.keys(draft?.text || {}).sort(), [draft])
  const changedStyleFields = useMemo(() => Object.keys(draft?.styles || {}).sort(), [draft])

  const changedFields = useMemo(() => {
    return [...new Set([...changedTextFields, ...changedStyleFields])].sort()
  }, [changedTextFields, changedStyleFields])

  const draftStats = useMemo(() => ({
    textCount: changedTextFields.length,
    styleCount: changedStyleFields.length,
    totalCount: changedFields.length,
  }), [changedTextFields, changedStyleFields, changedFields])

  const savedStats = useMemo(() => ({
    textCount: Object.keys(savedConfig?.text || {}).length,
    styleCount: Object.keys(savedConfig?.styles || {}).length,
    blockCount: Object.keys(savedConfig?.blocks || {}).length,
  }), [savedConfig])

  const effectiveConfig = useMemo(
    () => mergePublicConfig(savedConfig || emptyConfig(), draft || emptyDraft()),
    [savedConfig, draft]
  )

  const effectiveStats = useMemo(() => ({
    textCount: Object.keys(effectiveConfig?.text || {}).length,
    styleCount: Object.keys(effectiveConfig?.styles || {}).length,
    blockCount: Object.keys(effectiveConfig?.blocks || {}).length,
  }), [effectiveConfig])

  const hasDraftChanges = changedFields.length > 0
  const isConfigReady = backendMode === 'd1' && loadState === 'loaded'

  const startEditing = useCallback(() => {
    if (!isAdmin) return false
    setIsEditing(true)
    return true
  }, [isAdmin])

  const value = useMemo(() => ({
    isEditing,
    isAdmin,
    canSave,
    backendMode,
    isConfigReady,
    selectedField,
    setSelectedField,
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
    loadState,
    saveState,
    loadError,
    saveError,
    permissionState,
    permissionError,
    lastLoadedAt,
    lastSavedAt,
    configVersion,
    schemaVersion,
    setSavedConfig,
    startEditing,
    toggleEditing: () => {
      setIsEditing((v) => {
        const next = !v
        if (!next) setSelectedField(null)
        return next
      })
    },
    stopEditing() {
      setSelectedField(null)
      setIsEditing(false)
    },
    async reloadFromBackend() {
      await reloadFromBackend()
    },
    discardDraftAndReload() {
      const fresh = emptyDraft()
      setDraftSnapshot(fresh)
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
      setSelectedField(null)
      return reloadFromBackend()
    },
    updateText(field, value) {
      setDraftSnapshot((prev) => ({
        ...prev,
        text: {
          ...prev.text,
          [field]: value,
        },
      }))
    },
    updateStyle(field, patch) {
      setDraftSnapshot((prev) => ({
        ...prev,
        styles: {
          ...prev.styles,
          [field]: {
            ...(prev.styles?.[field] || {}),
            ...patch,
          },
        },
      }))
    },
    resetField(field) {
      setDraftSnapshot((prev) => {
        const nextText = { ...(prev.text || {}) }
        const nextStyles = { ...(prev.styles || {}) }
        delete nextText[field]
        delete nextStyles[field]
        return { text: nextText, styles: nextStyles }
      })
    },
    async saveDraftToBackend() {
      if (!canSave || backendMode !== 'd1' || loadState !== 'loaded') {
        setSaveState('error')
        setSaveError(!canSave ? 'save not allowed' : 'wait for the saved D1 configuration to finish loading before saving')
        return
      }

      try {
        setSaveState('saving')
        setSaveError('')

        const next = mergePublicConfig(savedConfig || emptyConfig(), draftRef.current || emptyDraft())
        const payload = buildPublicConfigPayload(next)
        const data = await savePublicConfigPayload(payload)
        const saved = data?.received?.publicSite || next

        setSavedConfig(saved)
        setDraftSnapshot(emptyDraft())
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch {
          // ignore
        }

        setBackendMode(data?.mode || backendMode || 'unknown')
        setLastSavedAt(data?.updatedAt || new Date().toISOString())
        setConfigVersion(Number(data?.version || configVersion || 1))
        setSchemaVersion(Number(data?.schemaVersion || schemaVersion || 2))
        setSaveState('saved')
        window.setTimeout(() => setSaveState('idle'), 1500)
      } catch (error) {
        setSaveState('error')
        setSaveError(String(error?.message || error))
      }
    },
    clearDraft() {
      const fresh = emptyDraft()
      setDraftSnapshot(fresh)
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
    },
    importDraftPatch(configLike) {
      const normalized = normalizePublicConfig(configLike)
      setDraftSnapshot((prev) => mergePublicConfig(prev || emptyDraft(), toDraftShape(normalized)))
    },
    replaceDraftWithImported(configLike) {
      const normalized = normalizePublicConfig(configLike)
      setDraftSnapshot(toDraftShape(normalized))
    },
    exportDraft() {
      return JSON.stringify(draftRef.current || draft, null, 2)
    },
    hasPendingDraftChanges,
  }), [
    isEditing,
    isAdmin,
    canSave,
    backendMode,
    isConfigReady,
    selectedField,
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
    loadState,
    saveState,
    loadError,
    saveError,
    permissionState,
    permissionError,
    lastLoadedAt,
    lastSavedAt,
    configVersion,
    schemaVersion,
    startEditing,
  ])

  return (
    <PublicEditContext.Provider value={value}>
      {children}
    </PublicEditContext.Provider>
  )
}

export function usePublicEdit() {
  const ctx = useContext(PublicEditContext)
  if (!ctx) throw new Error('usePublicEdit must be used inside PublicEditProvider')
  return ctx
}
