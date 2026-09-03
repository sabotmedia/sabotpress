const visualElements = [
  ['Polaroid Photo Frame', 'Frames', 'frame', ['photo frame', 'polaroid', 'collage', 'photo', 'frame', 'zine'], 'polaroid'],
  ['Torn Paper Photo Frame', 'Frames', 'frame', ['photo frame', 'torn paper', 'collage', 'photo', 'frame', 'zine'], 'tornFrame'],
  ['Blob Photo Mask', 'Frames', 'frame', ['photo mask', 'blob', 'organic', 'photo', 'frame', 'mask'], 'blob'],
  ['Circle Photo Frame', 'Frames', 'frame', ['photo frame', 'circle', 'portrait', 'photo', 'mask'], 'circle'],
  ['Arch Photo Frame', 'Frames', 'frame', ['photo frame', 'arch', 'poster', 'photo', 'mask'], 'arch'],
  ['Film Strip Frame', 'Frames', 'frame', ['photo frame', 'film strip', 'photo booth', 'collage', 'frame'], 'film'],
  ['Newspaper Clipping Frame', 'Frames', 'frame', ['newspaper', 'clipping', 'article', 'frame', 'press'], 'clipping'],
  ['Zine Panel Frame', 'Frames', 'frame', ['zine', 'panel', 'comic', 'frame', 'layout'], 'panel'],
  ['Riso Grain Overlay', 'Textures', 'texture', ['riso', 'risograph', 'grain', 'texture', 'overlay', 'print'], 'riso'],
  ['Photocopy Noise Overlay', 'Textures', 'texture', ['photocopy', 'xerox', 'noise', 'texture', 'paper', 'zine'], 'noise'],
  ['Halftone Burst', 'Textures', 'texture', ['halftone', 'dots', 'burst', 'newspaper', 'texture'], 'burst'],
  ['Halftone Dot Field', 'Textures', 'texture', ['halftone', 'dots', 'newspaper', 'texture', 'print'], 'dots'],
  ['Tape Corners', 'Collage', 'collage', ['tape', 'corners', 'collage', 'zine', 'scrapbook', 'photo'], 'tapeCorners'],
  ['Torn Paper Edge', 'Collage', 'collage', ['torn paper', 'edge', 'collage', 'zine', 'paper'], 'tornEdge'],
  ['Stapled Paper Scrap', 'Collage', 'collage', ['staple', 'paper', 'scrap', 'collage', 'zine'], 'staple'],
  ['Ink Smear', 'Collage', 'texture', ['ink', 'smear', 'brush', 'texture', 'zine'], 'smear'],
]

function slugify(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
function escapeXml(value = '') {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function dataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
function dots() {
  return Array.from({ length: 56 }, (_, index) => {
    const x = 26 + (index % 8) * 30
    const y = 28 + Math.floor(index / 8) * 28
    const r = Math.max(2, 11 - Math.floor(index / 8))
    return `<circle cx="${x}" cy="${y}" r="${r}"/>`
  }).join('')
}
function noise() {
  return Array.from({ length: 70 }, (_, index) => {
    const x = (index * 47) % 236
    const y = (index * 73) % 236
    const w = 4 + (index % 17)
    return `<path d="M${x} ${y}h${w}" stroke="#111" stroke-width="${1 + (index % 3)}" opacity=".${2 + (index % 6)}"/>`
  }).join('')
}
function renderSvg(title, kind) {
  const label = escapeXml(title)
  const base = '<rect width="256" height="256" rx="24" fill="#fffdf8"/>'
  const map = {
    polaroid: '<rect x="42" y="26" width="172" height="204" fill="#fff" stroke="#111" stroke-width="8"/><rect x="60" y="44" width="136" height="120" fill="#e7edf2" stroke="#111" stroke-width="5"/><path d="M72 196h112" stroke="#c22b26" stroke-width="8"/>',
    tornFrame: '<path d="M34 42 58 32l24 16 30-14 26 16 32-14 26 14 26-8v172l-28-10-30 14-28-14-30 14-28-16-32 12-22-14Z" fill="#fff" stroke="#111" stroke-width="8"/><rect x="64" y="66" width="128" height="112" fill="#e7edf2" stroke="#c22b26" stroke-width="5"/>',
    blob: '<path d="M66 54c44-38 116-16 132 42 18 62-22 112-84 104-54-8-96-50-78-96 6-16 16-34 30-50Z" fill="#e7edf2" stroke="#111" stroke-width="8"/><path d="M84 184c36 18 82 16 110-16" fill="none" stroke="#c22b26" stroke-width="7"/>',
    circle: '<circle cx="128" cy="116" r="78" fill="#e7edf2" stroke="#111" stroke-width="9"/><path d="M74 210h108" stroke="#c22b26" stroke-width="9"/>',
    arch: '<path d="M54 206V104c0-46 34-76 74-76s74 30 74 76v102Z" fill="#e7edf2" stroke="#111" stroke-width="9"/><path d="M72 204h112" stroke="#c22b26" stroke-width="8"/>',
    film: '<rect x="32" y="54" width="192" height="148" fill="#111"/><rect x="62" y="76" width="52" height="104" fill="#e7edf2"/><rect x="142" y="76" width="52" height="104" fill="#e7edf2"/><path d="M42 72h12M42 100h12M42 128h12M42 156h12M202 72h12M202 100h12M202 128h12M202 156h12" stroke="#fff" stroke-width="8"/>',
    clipping: '<rect x="38" y="34" width="180" height="188" fill="#fff" stroke="#111" stroke-width="7"/><rect x="58" y="54" width="140" height="34" fill="#111"/><path d="M58 112h140M58 138h118M58 164h140M58 190h96" stroke="#c22b26" stroke-width="7"/>',
    panel: '<rect x="30" y="36" width="196" height="184" fill="#fff" stroke="#111" stroke-width="10"/><path d="M48 62h160M48 194h160" stroke="#c22b26" stroke-width="7" stroke-dasharray="14 10"/>',
    riso: `<rect x="22" y="40" width="212" height="176" fill="#f6d7d2" stroke="#111" stroke-width="6"/><g fill="#c22b26" opacity=".38">${dots()}</g>`,
    noise: `<rect x="28" y="42" width="200" height="172" fill="#fff" stroke="#111" stroke-width="6"/>${noise()}<path d="M44 70h164M44 186h164" stroke="#c22b26" stroke-width="6" opacity=".5"/>`,
    burst: '<path d="M128 28 146 86l56-28-28 56 58 14-58 14 28 56-56-28-18 58-18-58-56 28 28-56-58-14 58-14-28-56 56 28Z" fill="#fff" stroke="#111" stroke-width="8"/><circle cx="128" cy="128" r="34" fill="#c22b26" opacity=".75"/>',
    dots: `<g fill="#111">${dots()}</g>`,
    tapeCorners: '<path d="M34 36h74v36H34Zm114 0h74v36h-74ZM34 184h74v36H34Zm114 0h74v36h-74Z" fill="#ffe88a" stroke="#111" stroke-width="5"/><rect x="62" y="62" width="132" height="132" fill="none" stroke="#c22b26" stroke-width="5" stroke-dasharray="12 8"/>',
    tornEdge: '<path d="M26 102 50 90l24 18 28-16 26 16 28-16 24 16 28-14 24 10v68l-24-10-28 14-24-16-28 16-26-16-28 16-24-18-26 12Z" fill="#fff" stroke="#111" stroke-width="8"/>',
    staple: '<path d="M54 54h148v148H54Z" fill="#fff" stroke="#111" stroke-width="8"/><path d="M94 42v50M116 42v50" stroke="#999" stroke-width="8"/><path d="M76 132h104" stroke="#c22b26" stroke-width="7"/>',
    smear: '<path d="M38 126c34-34 70-6 98-30 26-22 56-10 82 4-18 36-50 34-78 50-38 22-74 12-102-24Z" fill="#111" opacity=".88"/><path d="M48 172c52 8 104-10 158 0" stroke="#c22b26" stroke-width="10" stroke-linecap="round"/>',
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256" role="img" aria-label="${label}">${base}<g>${map[kind] || map.polaroid}</g></svg>`
}

export function getPrintlabElements() {
  return visualElements.map(([title, category, bucket, tags, kind]) => {
    const url = dataUrl(renderSvg(title, kind))
    const allTags = [...tags, category, bucket, title, ...title.split(/\s+/)]
    return {
      id: `printlab-element:${slugify(category)}:${slugify(title)}`,
      title,
      description: `${category} visual asset for Printlab layouts.`,
      thumbnailUrl: url,
      previewUrl: url,
      downloadUrl: url,
      source: 'printlab-elements',
      sourceLabel: 'Printlab Elements',
      mediaType: 'element',
      mimeType: 'image/svg+xml',
      license: 'MIT',
      licenseUrl: '',
      creator: 'SabotPress',
      attributionText: 'Printlab Elements / SabotPress',
      tags: allTags,
      category,
      bucket,
      raw: { title, category, bucket, tags: allTags },
    }
  })
}
