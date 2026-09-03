export function PosterSplitRenderer({
  previewRef,
  output,
}) {
  return (
    <article
      className="print-lab-preview print-lab-output print-lab-preview--poster-split"
      ref={previewRef}
      style={{
        '--split-columns': output.wide,
        '--print-margin-top': `${output.margins.top}px`,
        '--print-margin-right': `${output.margins.right}px`,
        '--print-margin-bottom': `${output.margins.bottom}px`,
        '--print-margin-left': `${output.margins.left}px`,
      }}
    >
      {output.imageUrl ? (
        <div className="print-lab-split-grid">
          {output.panels.map((panel) => (
            <section
              className="print-lab-split-panel"
              key={panel.id}
              style={{
                backgroundImage: `url("${output.imageUrl}")`,
                backgroundPosition: panel.objectPosition,
                backgroundSize: output.backgroundSize,
                padding: `var(--print-margin-top) var(--print-margin-right) var(--print-margin-bottom) var(--print-margin-left)`,
              }}
            >
              <img
                className="print-lab-split-panel__print-image"
                src={output.imageUrl}
                alt=""
                style={{
                  objectFit: 'cover',
                  objectPosition: panel.objectPosition,
                }}
              />
              {output.showNumbers ? <span>{panel.number}</span> : null}
            </section>
          ))}
        </div>
      ) : (
        <div className="print-lab-preview-empty print-lab-preview-empty--source">
          <strong>Image required for poster split</strong>
          <span>{output.label} printable panel preview</span>
          <p>{output.missingSourceMessage}</p>
        </div>
      )}
    </article>
  )
}
