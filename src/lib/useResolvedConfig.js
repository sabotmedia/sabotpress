import { useMemo } from 'react'
import { usePublicEdit } from '../components/PublicEditContext'
import { resolvePublicConfig } from './publicConfig'

const EMPTY_CONFIG = { text: {}, styles: {}, blocks: {} }

export function useResolvedConfig() {
  const {
    effectiveConfig,
    savedConfig,
    isAdmin,
    isEditing,
    backendMode,
    loadState,
  } = usePublicEdit()

  return useMemo(() => {
    // Published public pages must be device-independent. Never let a browser-local
    // draft or legacy saved-config cache override D1 unless an authenticated editor
    // is explicitly in edit mode.
    if (isAdmin && isEditing) {
      return resolvePublicConfig(effectiveConfig || EMPTY_CONFIG)
    }

    // Until the authoritative D1 config has loaded, render repository defaults
    // rather than a stale localStorage snapshot from this particular browser.
    if (backendMode !== 'd1' || loadState !== 'loaded') {
      return resolvePublicConfig(EMPTY_CONFIG)
    }

    return resolvePublicConfig(savedConfig || EMPTY_CONFIG)
  }, [effectiveConfig, savedConfig, isAdmin, isEditing, backendMode, loadState])
}
