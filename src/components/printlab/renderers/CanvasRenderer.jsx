import { useEffect } from 'react'
import { canvasResizeHandles, getCanvasFontFamily, getCanvasMediaFrame } from '../lib/canvasMath'

export function CanvasRenderer({
  previewRef,
  output,
  uploadedFontFaceCss,
  canvasViewportRef,
  canvasRef,
  canvasZoom,
  selectedCanvasBlockId,
  setSelectedCanvasBlockId,
  editingTextBlockId,
  setEditingTextBlockId,
  uploadedCanvasFonts,
  startCanvasDrag,
  startCanvasResize,
  updateCanvasBlock,
  openCanvasContextMenu,
}) {
  const canvasSize = output.canvasSize
  const canvasBackground = output.canvasBackground
  const canvasBlocks = output.canvasBlocks
  useEffect(() => {
    if (!editingTextBlockId) return
    const node = canvasRef.current?.querySelector(`[data-text-block-id="${editingTextBlockId}"]`)
    if (!node) return
    node.focus()
  }, [canvasRef, editingTextBlockId])

  return (
    <article className="print-lab-preview print-lab-output print-lab-preview--canvas" ref={previewRef}>
      {uploadedFontFaceCss ? <style>{uploadedFontFaceCss}</style> : null}
      <div
        className="print-lab-canvas-viewport"
        ref={canvasViewportRef}
      >
        <div
          className="print-lab-canvas-shell"
          style={{
            width: `${canvasSize.width * canvasZoom}px`,
            height: `${canvasSize.height * canvasZoom}px`,
          }}
        >
          <div
            className="print-lab-canvas-stage"
            ref={canvasRef}
            style={{
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
              transform: `scale(${canvasZoom})`,
              backgroundColor: canvasBackground,
              printColorAdjust: 'exact',
              WebkitPrintColorAdjust: 'exact',
            }}
            onPointerDown={() => setSelectedCanvasBlockId('')}
          >
            {canvasBlocks.map((block) => {
              const selected = block.id === selectedCanvasBlockId
              const blockWidth = Math.max(1, Number(block.width || 1))
              const blockHeight = Math.max(1, Number(block.height || 1))
              const mediaFrame = getCanvasMediaFrame(block)
              const fit = block.fit || 'cover'
              const editing = block.id === editingTextBlockId
              const blockStyle = {
                left: `${Number(block.x || 0)}px`,
                top: `${Number(block.y || 0)}px`,
                width: `${blockWidth}px`,
                height: `${blockHeight}px`,
                opacity: block.opacity ?? 1,
              }
              const mediaStyle = block.type === 'image' && mediaFrame ? (
                fit === 'stretch'
                  ? {
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                  }
                  : {
                    left: `${mediaFrame.mediaX - Number(block.x || 0)}px`,
                    top: `${mediaFrame.mediaY - Number(block.y || 0)}px`,
                    width: `${mediaFrame.mediaWidth}px`,
                    height: `${mediaFrame.mediaHeight}px`,
                    objectFit: fit,
                  }
              ) : null

              return (
                <div
                  className={`print-lab-canvas-block print-lab-canvas-block--${block.type}${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}`}
                  key={block.id}
                  style={blockStyle}
                  onPointerDown={(event) => startCanvasDrag(event, block)}
                  onContextMenu={(event) => openCanvasContextMenu(event, block)}
                  onDoubleClick={(event) => {
                    if (block.type !== 'text') return
                    event.stopPropagation()
                    setEditingTextBlockId(block.id)
                  }}
                  title={block.type === 'text' ? 'Double-click to edit text' : undefined}
                >
                  {block.type === 'image' ? (
                    <img src={block.src} alt="" draggable={false} style={mediaStyle} />
                  ) : (
                    <div
                      className="print-lab-canvas-text"
                      contentEditable={editing}
                      data-text-block-id={block.id}
                      suppressContentEditableWarning
                      onPointerDown={(event) => {
                        if (editing) {
                          event.stopPropagation()
                          return
                        }
                        if (selected && event.detail > 1) {
                          event.stopPropagation()
                          return
                        }
                        startCanvasDrag(event, block)
                      }}
                      onBlur={(event) => {
                        updateCanvasBlock(block.id, { text: event.currentTarget.innerText })
                        setEditingTextBlockId('')
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Escape') return
                        event.preventDefault()
                        event.currentTarget.blur()
                        setEditingTextBlockId('')
                      }}
                      style={{
                        color: block.color,
                        fontFamily: getCanvasFontFamily(block.fontFamily, uploadedCanvasFonts),
                        fontSize: `${block.fontSize}px`,
                        fontWeight: block.fontWeight,
                        lineHeight: block.lineHeight,
                        textAlign: block.align || 'left',
                      }}
                    >
                      {block.text}
                    </div>
                  )}
                  {selected ? (
                    <>
                      <span className="print-lab-canvas-block__label">{block.title || block.type}</span>
                      {canvasResizeHandles.map((handle) => {
                        const actionLabel = block.type === 'image' && handle.id.length === 1 ? 'Crop image' : 'Resize block'
                        return (
                          <span
                            aria-label={`${actionLabel}: ${handle.id}`}
                            className={`print-lab-canvas-resize print-lab-canvas-resize--${handle.id}`}
                            key={handle.id}
                            role="button"
                            tabIndex="-1"
                            title={actionLabel}
                            style={{ cursor: handle.cursor }}
                            onPointerDown={(event) => startCanvasResize(event, block, handle.id)}
                          />
                        )
                      })}
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </article>
  )
}
