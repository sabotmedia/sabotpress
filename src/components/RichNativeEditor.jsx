import { cloneRichDoc, createEmptyRichDoc, normalizeRichDoc, makeId, serializeRichDocToPlainText } from '../lib/richNativeContent'

function blockLabel(type) {
  if (type === 'heading') return 'heading'
  if (type === 'quote') return 'quote'
  if (type === 'image') return 'image'
  if (type === 'embed') return 'embed'
  return 'paragraph'
}

export function RichNativeEditor({ value, onChange, mediaAssetsSlot }) {
  const doc = normalizeRichDoc(value)

  function updateBlock(id, patch) {
    onChange(doc.map((block) => (block.id === id ? { ...block, ...patch } : block)))
  }

  function removeBlock(id) {
    const next = doc.filter((block) => block.id !== id)
    onChange(next.length ? next : createEmptyRichDoc())
  }

  function moveBlock(id, direction) {
    const idx = doc.findIndex((block) => block.id === id)
    if (idx < 0) return
    const next = cloneRichDoc(doc)
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onChange(next)
  }

  function addBlock(type) {
    onChange([...doc, normalizeRichDoc([{ id: makeId(), type, text: '', url: '', caption: '', alt: '', assetId: '' }])[0]])
  }

  function insertAsset(asset) {
    const alt = String(asset?.altText || asset?.alt || '')
    const caption = String(asset?.caption || asset?.title || '')
    onChange([
      ...doc,
      {
        id: makeId(),
        type: 'image',
        assetId: asset.id,
        url: asset.url,
        alt,
        caption,
      },
    ])
  }

  return (
    <section className="rich-native-editor">
      <div className="rich-native-editor__toolbar" aria-label="block insertion tools">
        <button className="button" type="button" onClick={() => addBlock('paragraph')}>+ paragraph</button>
        <button className="button" type="button" onClick={() => addBlock('heading')}>+ heading</button>
        <button className="button" type="button" onClick={() => addBlock('quote')}>+ quote</button>
        <button className="button" type="button" onClick={() => addBlock('embed')}>+ embed</button>
      </div>

      <div className="rich-native-editor__layout">
        <div className="rich-native-editor__blocks">
          {doc.map((block) => (
            <article className="rich-native-block" key={block.id}>
              <div className="rich-native-block__meta">
                <strong>{blockLabel(block.type)}</strong>
                <div className="review-card__actions">
                  <button className="button" type="button" onClick={() => moveBlock(block.id, 'up')}>up</button>
                  <button className="button" type="button" onClick={() => moveBlock(block.id, 'down')}>down</button>
                  <button className="button" type="button" onClick={() => removeBlock(block.id)}>remove</button>
                </div>
              </div>

              {(block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote') ? (
                <textarea
                  className="native-content-editor__textarea native-content-editor__textarea--sm"
                  value={block.text || ''}
                  onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                />
              ) : null}

              {block.type === 'embed' ? (
                <>
                  <label className="archive-control">
                    <span>url</span>
                    <input type="text" value={block.url || ''} onChange={(e) => updateBlock(block.id, { url: e.target.value })} />
                  </label>
                  <label className="archive-control">
                    <span>caption</span>
                    <input type="text" value={block.caption || ''} onChange={(e) => updateBlock(block.id, { caption: e.target.value })} />
                  </label>
                </>
              ) : null}

              {block.type === 'image' ? (
                <>
                  <label className="archive-control">
                    <span>image url</span>
                    <input type="text" value={block.url || ''} onChange={(e) => updateBlock(block.id, { url: e.target.value })} />
                  </label>
                  <label className="archive-control">
                    <span>alt</span>
                    <input type="text" value={block.alt || ''} onChange={(e) => updateBlock(block.id, { alt: e.target.value })} />
                  </label>
                  <label className="archive-control">
                    <span>caption</span>
                    <input type="text" value={block.caption || ''} onChange={(e) => updateBlock(block.id, { caption: e.target.value })} />
                  </label>
                  {block.url ? <img className="rich-native-block__preview-image" src={block.url} alt={block.alt || ''} /> : null}
                </>
              ) : null}
            </article>
          ))}
        </div>

        <div className="rich-native-editor__sidebar">
          {mediaAssetsSlot ? mediaAssetsSlot({ onPick: insertAsset }) : null}

          <section className="review-summary-card rich-native-editor__plain-preview">
            <div className="review-summary-card__eyebrow">plain text preview</div>
            <pre className="review-card__snippet">{serializeRichDocToPlainText(doc)}</pre>
          </section>
        </div>
      </div>
    </section>
  )
}
