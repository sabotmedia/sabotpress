import { getCanvasFontFamily, getCanvasMediaFrame } from '../lib/canvasMath'

function percent(value, total) {
  return `${(Number(value || 0) / Math.max(1, Number(total || 1))) * 100}%`
}

function getMediaStyle(block, page) {
  const mediaFrame = getCanvasMediaFrame(block)
  if (!mediaFrame) return null
  if ((block.fit || 'cover') === 'stretch') {
    return {
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      objectFit: 'fill',
    }
  }
  return {
    left: percent(mediaFrame.mediaX - Number(block.x || 0), Number(block.width || page.width)),
    top: percent(mediaFrame.mediaY - Number(block.y || 0), Number(block.height || page.height)),
    width: percent(mediaFrame.mediaWidth, Number(block.width || page.width)),
    height: percent(mediaFrame.mediaHeight, Number(block.height || page.height)),
    objectFit: block.fit || 'cover',
  }
}

export function PublicationPageSurface({
  page,
  uploadedCanvasFonts = [],
  label = '',
  blankLabel = 'Blank',
  className = '',
  fit = 'contain-page',
}) {
  if (!page) {
    return (
      <div className={`print-lab-publication-surface print-lab-publication-surface--blank print-lab-publication-surface--fit-${fit} ${className}`}>
        <span className="print-lab-publication-surface__label">{blankLabel}</span>
      </div>
    )
  }

  const width = Number(page.width || page.canvasSize?.width || 720)
  const height = Number(page.height || page.canvasSize?.height || 540)
  const blocks = Array.isArray(page.blocks) ? page.blocks : []
  const orientation = width > height ? 'landscape' : 'portrait'

  return (
    <div
      className={`print-lab-publication-surface print-lab-publication-surface--fit-${fit} print-lab-publication-surface--${orientation} ${className}`}
      style={{
        '--publication-page-width': width,
        '--publication-page-height': height,
        '--publication-page-ratio': `${width} / ${height}`,
        backgroundColor: page.background || page.backgroundColor || '#fffdf8',
      }}
    >
      {label ? <span className="print-lab-publication-surface__label">{label}</span> : null}
      <div
        className="print-lab-publication-surface__page"
        style={{
          aspectRatio: `${width} / ${height}`,
          backgroundColor: page.background || page.backgroundColor || '#fffdf8',
        }}
      >
        <div className="print-lab-publication-surface__stage">
          {blocks.map((block) => {
            const blockStyle = {
              left: percent(block.x, width),
              top: percent(block.y, height),
              width: percent(block.width, width),
              height: percent(block.height, height),
              opacity: block.opacity ?? 1,
            }
            if (block.type === 'image') {
              return (
                <div className="print-lab-publication-block print-lab-publication-block--image" key={block.id} style={blockStyle}>
                  <img src={block.src} alt="" draggable={false} style={getMediaStyle(block, page)} />
                </div>
              )
            }
            return (
              <div className="print-lab-publication-block print-lab-publication-block--text" key={block.id} style={blockStyle}>
                <div
                  className="print-lab-publication-text"
                  style={{
                    color: block.color,
                    fontFamily: getCanvasFontFamily(block.fontFamily, uploadedCanvasFonts),
                    fontSize: `${(Number(block.fontSize || 16) / width) * 100}cqw`,
                    fontWeight: block.fontWeight,
                    lineHeight: block.lineHeight,
                    textAlign: block.align || 'left',
                  }}
                >
                  {block.text}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
