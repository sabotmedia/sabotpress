import { PublicationPageSurface } from './PublicationPageSurface'

export function HalfFoldRenderer({
  previewRef,
  output,
  activeSheetIndex = 0,
  onNavigate,
  uploadedCanvasFonts,
  onSelectPage,
}) {
  const sheetCount = output.sheets.length
  const activeIndex = Math.max(0, Math.min(activeSheetIndex, sheetCount - 1))
  const sheet = output.sheets[activeIndex] || output.sheets[0]
  const canNavigate = sheetCount > 1

  function navigate(nextIndex) {
    onNavigate?.(Math.max(0, Math.min(nextIndex, sheetCount - 1)))
  }

  return (
    <article
      className="print-lab-preview print-lab-output print-lab-preview--half-fold-zine"
      ref={previewRef}
      style={{
        '--print-margin-top': `${output.margins.top}px`,
        '--print-margin-right': `${output.margins.right}px`,
        '--print-margin-bottom': `${output.margins.bottom}px`,
        '--print-margin-left': `${output.margins.left}px`,
      }}
    >
      <div className="print-lab-half-fold-nav" aria-label="Half-fold sheet navigation">
        <button className="button" type="button" disabled={!canNavigate || activeIndex === 0} onClick={() => navigate(activeIndex - 1)}>
          Previous
        </button>
        <strong>{sheet?.label || 'Sheet 1'} of {sheetCount}</strong>
        <button className="button" type="button" disabled={!canNavigate || activeIndex >= sheetCount - 1} onClick={() => navigate(activeIndex + 1)}>
          Next
        </button>
      </div>

      {sheet ? (
        <div className="print-lab-half-fold-stack" aria-label="Half-fold print layout">
          <div className="print-lab-half-fold-sheet" key={sheet.id}>
            <div className="print-lab-half-fold-sheet__label">
              <strong>{sheet.label}</strong>
              <span>{sheet.panels.map((panel) => panel.positionLabel).join(' / ')} / {output.sheetSize.label}</span>
            </div>
            <div className="print-lab-half-fold-spread">
              {sheet.panels.map((panel) => (
                <section className={`print-lab-half-fold-panel print-lab-half-fold-panel--${panel.side}`} key={panel.id}>
                  {panel.page ? (
                    <button
                      className="print-lab-half-fold-panel__label"
                      type="button"
                      onClick={() => onSelectPage?.(panel.page.id)}
                    >
                      {panel.label}
                    </button>
                  ) : (
                    <span className="print-lab-half-fold-panel__label">{panel.label}</span>
                  )}
                  <PublicationPageSurface
                    blankLabel={panel.positionLabel}
                    className="print-lab-publication-surface--half-fold"
                    fit="cover-panel"
                    page={panel.page}
                    uploadedCanvasFonts={uploadedCanvasFonts}
                  />
                </section>
              ))}
              <span className="print-lab-half-fold-spread__fold" aria-hidden="true" />
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}
