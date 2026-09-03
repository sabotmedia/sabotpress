import { useMemo } from 'react'
import { usePublicEdit } from '../components/PublicEditContext'
import { resolvePublicConfig } from './publicConfig'

const EMPTY_CONFIG = { text: {}, styles: {}, blocks: {} }
function authoritativeMode(mode) { return mode === 'd1' || mode === 'browser-local' }

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
    if (isAdmin && isEditing) {
      return resolvePublicConfig(effectiveConfig || EMPTY_CONFIG)
    }

    // Public rendering uses only the authoritative store for the active runtime:
    // server/desktop D1-compatible storage or the explicit browser-local database.
    if (!authoritativeMode(backendMode) || loadState !== 'loaded') {
      return resolvePublicConfig(EMPTY_CONFIG)
    }

    return resolvePublicConfig(savedConfig || EMPTY_CONFIG)
  }, [effectiveConfig, savedConfig, isAdmin, isEditing, backendMode, loadState])
}
