import { useEffect, useMemo, useState } from 'react'
import { getImportedImage } from '../../../lib/getImportedImage'
import { loadLocalMediaItems } from '../../../lib/localMediaLibrary'
import { loadPublishedNativePieces, mergeNativeAndImportedPieces } from '../../../lib/nativePublicFeed'
import { useWordPressPieces } from '../../../lib/useWordPressPieces'
import { importUrlAsset, normalizePrintlabAsset, searchUnifiedAssets } from '../lib/assetSources'

function getPieceId(piece) {
  const source = piece?.sourceKind || piece?.sourcePostType || piece?.origin || 'imported'
  const id = piece?.id || piece?.slug || piece?.sourcePostId || piece?.title || ''
  return `${source}:${String(id)}`
}

function getContentType(piece) {
  return piece?.contentType || piece?.type || piece?.sourcePostType || 'post'
}

function getPublishedAt(piece) {
  return piece?.publishedAt || piece?.date || piece?.createdAt || piece?.updatedAt || ''
}

function getPublishedAtLabel(piece) {
  const value = getPublishedAt(piece)
  if (!value) return ''
  const published = new Date(value)
  if (Number.isNaN(published.getTime())) return ''
  return published.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getFeaturedImage(piece) {
  return (
    piece?.featuredImage ||
    piece?.heroImage ||
    piece?.imageUrl ||
    piece?.image ||
    getImportedImage(piece) ||
    ''
  )
}

function isPublishedPiece(piece) {
  if (!piece || piece.hidden === true) return false
  const status = String(piece.status || '').toLowerCase()
  if (status) return status === 'published'
  return Boolean(getPublishedAt(piece))
}

function getPreviewHtml(piece) {
  return (
    piece?.bodyHtml ||
    piece?.contentHtml ||
    piece?.content ||
    piece?.body ||
    piece?.bodyText ||
    piece?.body_plain ||
    piece?.plainText ||
    piece?.text ||
    ''
  )
}

function getExcerpt(piece) {
  return piece?.excerpt || piece?.summary || piece?.description || piece?.subtitle || ''
}

function getPlainTextFromHtml(html = '') {
  const value = String(html || '').trim()
  if (!value) return ''
  const withBlockBreaks = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|figure)>/gi, '\n\n')

  if (typeof DOMParser === 'undefined') {
    return withBlockBreaks
      .replace(/<[^>]*>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(withBlockBreaks, 'text/html')
  doc.querySelectorAll('script, style, noscript').forEach((node) => node.remove())
  return (doc.body.textContent || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function dedupeImageItems(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item?.url) return false
    const key = item.url
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getPostMediaItems(pieces = []) {
  return pieces.map((piece) => {
    const url = getFeaturedImage(piece)
    if (!url) return null
    const id = getPieceId(piece)
    return {
      id: `post-image-${id || url}`,
      url,
      title: piece.title || 'Post image',
      source: getContentType(piece),
      meta: getPublishedAtLabel(piece),
    }
  }).filter(Boolean)
}

function normalizeMediaAsset(item) {
  return normalizePrintlabAsset({
    id: item.id,
    title: item.title || item.filename || 'Uploaded media',
    thumbnailUrl: item.thumbnailUrl || item.url || item.dataUrl,
    fullUrl: item.fullUrl || item.url || item.dataUrl,
    source: item.source || 'local-upload',
    creator: item.creator || '',
    license: item.license || '',
    licenseUrl: item.licenseUrl || '',
    attribution: item.attribution || '',
    mediaType: item.mediaType || 'image',
    landingUrl: item.landingUrl || '',
  })
}

export function usePrintlabSources(pieces = []) {
  const [nativePieces, setNativePieces] = useState([])
  const [nativeState, setNativeState] = useState('loading')
  const [localMedia, setLocalMedia] = useState([])
  const [sourceType, setSourceType] = useState('assets')
  const [selectedId, setSelectedId] = useState('')
  const [selectedMediaId, setSelectedMediaId] = useState('')
  const [uploadImage, setUploadImage] = useState(null)
  const [urlInput, setUrlInput] = useState('')
  const [urlAsset, setUrlAsset] = useState(null)
  const [assetMode, setAssetMode] = useState('everything')
  const [selectedAssetSourceIds, setSelectedAssetSourceIds] = useState([])
  const [assetQuery, setAssetQuery] = useState('')
  const [assetResults, setAssetResults] = useState([])
  const [assetProviderStates, setAssetProviderStates] = useState([])
  const [assetExpandedTerms, setAssetExpandedTerms] = useState([])
  const [assetState, setAssetState] = useState('idle')
  const [assetError, setAssetError] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const wordpressFeed = useWordPressPieces(pieces)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        setNativeState('loading')
        const loaded = await loadPublishedNativePieces()
        if (cancelled) return
        setNativePieces(Array.isArray(loaded) ? loaded : [])
        setNativeState('loaded')
      } catch {
        if (cancelled) return
        setNativePieces([])
        setNativeState('error')
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setLocalMedia(loadLocalMediaItems())
  }, [])

  function refreshLocalMedia() {
    setLocalMedia(loadLocalMediaItems())
  }

  const publishedPieces = useMemo(() => {
    const importedPieces = (wordpressFeed.pieces || pieces).filter(isPublishedPiece)
    return mergeNativeAndImportedPieces(importedPieces, nativePieces)
      .filter(isPublishedPiece)
      .sort((a, b) => new Date(getPublishedAt(b) || 0) - new Date(getPublishedAt(a) || 0))
  }, [nativePieces, pieces, wordpressFeed.pieces])

  useEffect(() => {
    if (!publishedPieces.length) {
      setSelectedId('')
      return
    }

    setSelectedId((current) => (
      publishedPieces.some((piece) => getPieceId(piece) === current)
        ? current
        : getPieceId(publishedPieces[0])
    ))
  }, [publishedPieces])

  const mediaItems = useMemo(() => {
    const localItems = localMedia.map((item) => ({
      id: item.id,
      url: item.url || item.dataUrl,
      fullUrl: item.fullUrl || item.url || item.dataUrl,
      thumbnailUrl: item.thumbnailUrl || item.url || item.dataUrl,
      title: item.title || item.filename || 'Uploaded media',
      source: item.source || 'local-upload',
      meta: item.filename || '',
      creator: item.creator || '',
      license: item.license || '',
      licenseUrl: item.licenseUrl || '',
      attribution: item.attribution || '',
      mediaType: item.mediaType || 'image',
      landingUrl: item.landingUrl || '',
    }))
    return dedupeImageItems([...localItems, ...getPostMediaItems(publishedPieces)])
  }, [localMedia, publishedPieces])

  useEffect(() => {
    if (!mediaItems.length) {
      setSelectedMediaId('')
      return
    }

    setSelectedMediaId((current) => (
      mediaItems.some((item) => item.id === current) ? current : mediaItems[0].id
    ))
  }, [mediaItems])

  useEffect(() => {
    if (sourceType !== 'assets') return
    setAssetResults([])
    setSelectedAssetId('')
    setAssetProviderStates([])
    setAssetExpandedTerms([])
    setAssetState('idle')
    setAssetError('')
  }, [assetMode, selectedAssetSourceIds, sourceType])

  const selectedPiece = publishedPieces.find((piece) => getPieceId(piece) === selectedId) || null
  const selectedMedia = mediaItems.find((item) => item.id === selectedMediaId) || null
  const selectedExternalAsset = assetResults.find((item) => item.id === selectedAssetId) || null
  const selectedPostImage = getFeaturedImage(selectedPiece)
  const selectedPostHtml = getPreviewHtml(selectedPiece)
  const selectedPostBody = useMemo(() => getPlainTextFromHtml(selectedPostHtml), [selectedPostHtml])
  const selectedPostExcerpt = getExcerpt(selectedPiece)
  const selectedPostTitle = selectedPiece?.title || ''
  const isLoading = nativeState === 'loading' && wordpressFeed.state === 'loading' && !publishedPieces.length

  const currentImage = useMemo(() => {
    if (sourceType === 'upload') return uploadImage
    if (sourceType === 'media') return selectedMedia ? normalizeMediaAsset(selectedMedia) : null
    if (sourceType === 'url') return urlAsset
    if (sourceType === 'assets') return selectedExternalAsset
    if (sourceType === 'post' && selectedPiece) {
      return selectedPostImage ? {
        id: getPieceId(selectedPiece),
        url: selectedPostImage,
        fullUrl: selectedPostImage,
        thumbnailUrl: selectedPostImage,
        title: selectedPostTitle || 'Post image',
        source: getContentType(selectedPiece),
        creator: '',
        license: '',
        licenseUrl: '',
        attribution: '',
        mediaType: 'image',
      } : null
    }
    return null
  }, [selectedExternalAsset, selectedMedia, selectedPiece, selectedPostImage, selectedPostTitle, sourceType, uploadImage, urlAsset])

  async function searchAssets(options = {}) {
    const nextQuery = typeof options === 'string' ? options : (options.query ?? assetQuery)
    const nextMode = typeof options === 'object' && options.mode ? options.mode : assetMode
    const nextSourceIds = typeof options === 'object' && Array.isArray(options.sourceIds) ? options.sourceIds : selectedAssetSourceIds
    const q = String(nextQuery || '').trim()
    try {
      setAssetState('loading')
      setAssetError('')
      const data = await searchUnifiedAssets({
        query: q,
        mode: nextMode,
        sourceIds: nextSourceIds,
        localMedia,
      })
      setAssetResults(data.results)
      setAssetProviderStates(data.providers)
      setAssetExpandedTerms(data.expandedTerms)
      setSelectedAssetId((current) => (data.results.some((item) => item.id === current) ? current : (data.results[0]?.id || '')))
      setAssetState('loaded')
      return data.results
    } catch (err) {
      setAssetResults([])
      setSelectedAssetId('')
      setAssetProviderStates([])
      setAssetExpandedTerms([])
      setAssetState('error')
      setAssetError(String(err?.message || err))
      return []
    }
  }

  function importUrl() {
    const asset = importUrlAsset(urlInput)
    setUrlAsset(asset)
    setSourceType('url')
    return asset
  }

  return {
    publishedPieces,
    mediaItems,
    selectedPiece,
    selectedMedia,
    selectedPostImage,
    selectedPostHtml,
    selectedPostBody,
    selectedPostExcerpt,
    selectedPostTitle,
    currentImage,
    sourceType,
    setSourceType,
    selectedId,
    setSelectedId,
    selectedMediaId,
    setSelectedMediaId,
    uploadImage,
    setUploadImage,
    refreshLocalMedia,
    urlInput,
    setUrlInput,
    urlAsset,
    setUrlAsset,
    importUrl,
    assetMode,
    setAssetMode,
    selectedAssetSourceIds,
    setSelectedAssetSourceIds,
    assetQuery,
    setAssetQuery,
    assetResults,
    setAssetResults,
    assetProviderStates,
    assetExpandedTerms,
    assetState,
    assetError,
    searchAssets,
    selectedAssetId,
    setSelectedAssetId,
    selectedExternalAsset,
    isLoading,
  }
}
