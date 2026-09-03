export function CanvasFloatingToolbar({
  selectedBlock,
  currentImageUrl,
  currentImageTitle,
  canvasBackground,
  canvasPreset,
  canvasPresetOptions,
  systemFontOptions,
  googleFontOptions,
  uploadedFonts,
  fitOptions,
  onUpdateBlock,
  onAddText,
  onAddImage,
  onDuplicate,
  onDelete,
  onMoveDown,
  onMoveUp,
  onSetBackground,
  onChangePreset,
}) {
  function stopToolbarPointer(event) {
    event.stopPropagation()
  }

  function updateSelected(patch) {
    if (!selectedBlock) return
    onUpdateBlock(selectedBlock.id, patch)
  }

  return (
    <div
      className={`print-lab-floating-toolbar${selectedBlock ? ' print-lab-floating-toolbar--block' : ' print-lab-floating-toolbar--page'}`}
      onPointerDown={stopToolbarPointer}
    >
      {selectedBlock ? (
        <>
          <strong>{selectedBlock.type === 'image' ? 'Image' : 'Text'}</strong>
          {selectedBlock.type === 'text' ? (
            <>
              <label>
                <span>Font</span>
                <select value={selectedBlock.fontFamily || 'system'} onChange={(event) => updateSelected({ fontFamily: event.target.value })}>
                  <optgroup label="System">
                    {systemFontOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Google">
                    {googleFontOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                  {uploadedFonts.length ? (
                    <optgroup label="Uploaded">
                      {uploadedFonts.map((font) => (
                        <option key={font.family} value={font.family}>{font.name}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label className="print-lab-floating-toolbar__number">
                <span>Size</span>
                <input
                  type="number"
                  min="8"
                  max="96"
                  value={selectedBlock.fontSize || 16}
                  onChange={(event) => updateSelected({ fontSize: Math.min(96, Math.max(8, Number(event.target.value || 16))) })}
                />
              </label>
              <button
                className={Number(selectedBlock.fontWeight || 500) >= 700 ? 'is-active' : ''}
                type="button"
                aria-pressed={Number(selectedBlock.fontWeight || 500) >= 700}
                onClick={() => updateSelected({ fontWeight: Number(selectedBlock.fontWeight || 500) >= 700 ? 500 : 800 })}
              >
                Bold
              </button>
              <div className="print-lab-floating-toolbar__segmented" role="group" aria-label="Text alignment">
                {['left', 'center', 'right'].map((align) => (
                  <button
                    className={(selectedBlock.align || 'left') === align ? 'is-active' : ''}
                    key={align}
                    type="button"
                    aria-pressed={(selectedBlock.align || 'left') === align}
                    onClick={() => updateSelected({ align })}
                  >
                    {align}
                  </button>
                ))}
              </div>
              <label className="print-lab-floating-toolbar__color">
                <span>Color</span>
                <input type="color" value={selectedBlock.color || '#111111'} onChange={(event) => updateSelected({ color: event.target.value })} />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>Fit</span>
                <select value={selectedBlock.fit || 'cover'} onChange={(event) => updateSelected({ fit: event.target.value })}>
                  {fitOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              {currentImageUrl ? (
                <button
                  type="button"
                  onClick={() => updateSelected({
                    src: currentImageUrl,
                    title: currentImageTitle || selectedBlock.title || 'Image',
                    name: currentImageTitle || selectedBlock.name || 'Image',
                  })}
                >
                  Use selected
                </button>
              ) : null}
              <button type="button" onClick={onDuplicate} title="Duplicate this image, then drag side handles to crop the copy into its own layer.">
                Crop copy
              </button>
              <small className="print-lab-floating-toolbar__hint">
                Manual layer split: duplicate, then drag side handles to crop each copy.
              </small>
            </>
          )}
          <button type="button" onClick={onDuplicate}>Duplicate</button>
          <button type="button" onClick={onMoveDown}>Send back</button>
          <button type="button" onClick={onMoveUp}>Bring forward</button>
          <button className="is-danger" type="button" onClick={onDelete}>Delete</button>
        </>
      ) : (
        <>
          <strong>Page</strong>
          <button type="button" onClick={onAddText}>Add Text</button>
          <button type="button" disabled={!currentImageUrl} onClick={onAddImage}>Add Selected Image</button>
          <label className="print-lab-floating-toolbar__color">
            <span>Background</span>
            <input type="color" value={canvasBackground} onChange={(event) => onSetBackground(event.target.value)} />
          </label>
          <div className="print-lab-floating-toolbar__segmented" role="group" aria-label="Page orientation">
            {Object.entries(canvasPresetOptions).map(([id, option]) => (
              <button
                className={canvasPreset === id ? 'is-active' : ''}
                key={id}
                type="button"
                aria-pressed={canvasPreset === id}
                onClick={() => onChangePreset(id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
