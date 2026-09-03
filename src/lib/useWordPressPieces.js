import { useEffect, useMemo, useState } from 'react'
import { fetchWordPressPieces, mergeWordPressWithFallback } from './wordpressClient'

export function useWordPressPieces(fallbackPieces = []) {
  const [wordpressPieces, setWordPressPieces] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        setState('loading')
        setError('')
        const pieces = await fetchWordPressPieces({ perPage: 100 })
        if (cancelled) return
        setWordPressPieces(pieces)
        setState(pieces.length ? 'loaded' : 'fallback')
      } catch (err) {
        if (cancelled) return
        setWordPressPieces([])
        setError(String(err?.message || err))
        setState('fallback')
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [])

  const pieces = useMemo(
    () => mergeWordPressWithFallback(wordpressPieces, fallbackPieces),
    [wordpressPieces, fallbackPieces]
  )

  return {
    pieces,
    wordpressPieces,
    usingWordPress: wordpressPieces.length > 0,
    state,
    error,
  }
}
