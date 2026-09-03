const BODY_COPY_SELECTORS = [
  '.piece-body__content',
  '.piece-body__content p',
  '.piece-body__content li',
  '.piece-body__content blockquote',
  '.piece-body__content .post-body__paragraph',
  '.piece-body__content .post-body__block',
  '.piece-body__content .post-body__list',
  '.piece-body__content .post-body__list-item',
].join(',')

const DESCRIPTION_SELECTORS = [
  '.public-route-shell main p',
  '.public-route-shell main li',
  '.public-route-shell main blockquote',
  '.public-route-shell main figcaption',
  '.public-route-shell main dd',
  '.archive-card__excerpt',
  '.archive-card__excerpt p',
  '.project-hero__description',
  '.hero__excerpt',
  '.piece-card > p',
  '.piece-card__subtitle',
  '.publication-hero-card p',
  '.publication-post-card p',
  '.publication-card p',
  '.public-experience-panel p',
  '.missing-state p',
].join(',')

const BODY_HEADINGS = [
  ['.piece-body__content h1', '21px'],
  ['.piece-body__content h2, .piece-body__content .post-body__heading', '17px'],
  ['.piece-body__content h3', '15px'],
]

function important(node, property, value) {
  if (!node?.style) return
  node.style.setProperty(property, value, 'important')
}

function isMediaPost() {
  return document.body.classList.contains('is-sabot-preview-media') || /\b(zine|comic|comics|reader|manifesto|print|saboteurs)\b/i.test(decodeURIComponent(window.location.pathname || ''))
}

function setBodyCopy() {
  const mobile = window.matchMedia('(max-width: 720px)').matches
  const media = isMediaPost()
  const bodySize = media ? (mobile ? '12px' : '12.5px') : (mobile ? '12.5px' : '13px')

  document.querySelectorAll(BODY_COPY_SELECTORS).forEach((node) => {
    important(node, 'font-size', bodySize)
    important(node, 'line-height', media ? '1.46' : '1.5')
    important(node, 'letter-spacing', '0')
  })

  document.querySelectorAll(DESCRIPTION_SELECTORS).forEach((node) => {
    important(node, 'font-size', mobile ? '12px' : '12.5px')
    important(node, 'line-height', '1.4')
    important(node, 'letter-spacing', '0')
  })

  BODY_HEADINGS.forEach(([selector, desktopSize]) => {
    document.querySelectorAll(selector).forEach((node) => {
      const size = mobile
        ? selector.includes('h1') ? '19px' : selector.includes('h3') ? '14px' : '16px'
        : desktopSize
      important(node, 'font-size', size)
      important(node, 'line-height', '1.14')
    })
  })
}

function setLeadTitles() {
  const media = isMediaPost()
  const mobile = window.matchMedia('(max-width: 720px)').matches
  const size = media ? (mobile ? '17px' : '19px') : (mobile ? '24px' : '32px')

  document.querySelectorAll('.piece-article-lead__fallback h1, .piece-article-lead__title-below h1, .piece-article-lead__overlay h1').forEach((node) => {
    important(node, 'font-size', size)
    important(node, 'line-height', media ? '1.12' : '1.04')
    important(node, 'max-width', media ? '42ch' : '28ch')
    important(node, 'letter-spacing', media ? '0' : '-0.015em')
    important(node, 'overflow-wrap', 'normal')
    important(node, 'word-break', 'normal')
    important(node, 'hyphens', 'none')
  })

  if (media) {
    document.querySelectorAll('.piece-article-lead__eyebrow, .piece-article-lead__meta, .piece-article-lead__meta span').forEach((node) => {
      important(node, 'font-size', '10px')
      important(node, 'line-height', '1.3')
    })
    document.querySelectorAll('.piece-article-lead__title-below').forEach((node) => {
      important(node, 'margin-top', '10px')
      important(node, 'padding', '0')
    })
  }
}

function setHomepageOverlayTitles() {
  const homepage = document.querySelector('.publication-homepage')
  if (!homepage) return

  const mobile = window.matchMedia('(max-width: 900px)').matches
  const grid = homepage.querySelector('.publication-recent-grid')

  if (grid) {
    important(grid, 'grid-auto-rows', 'auto')
    important(grid, 'overflow', 'visible')
  }

  const configs = [
    {
      cardSelector: '.publication-hero-card--title-overlay',
      linkSelector: '.publication-hero-card__image-wrap',
      overlaySelector: '.publication-hero-card__overlay',
      titleSelector: 'h1',
      topPad: mobile ? 'clamp(15rem, 56vw, 25rem)' : 'clamp(18rem, 42vw, 34rem)',
      mobileSize: 'clamp(2rem, 8.5vw, 3.6rem)',
    },
    {
      cardSelector: '.publication-post-card--title-overlay',
      linkSelector: '.publication-post-card__link',
      overlaySelector: '.publication-post-card__overlay',
      titleSelector: 'h2',
      topPad: mobile ? 'clamp(10rem, 48vw, 17rem)' : 'clamp(12rem, 24vw, 18rem)',
      mobileSize: 'clamp(1.5rem, 6.2vw, 2.2rem)',
    },
  ]

  configs.forEach((config) => {
    homepage.querySelectorAll(config.cardSelector).forEach((card) => {
      const link = card.querySelector(config.linkSelector)
      const overlay = card.querySelector(config.overlaySelector)
      const title = card.querySelector(config.titleSelector)

      important(card, 'aspect-ratio', 'auto')
      important(card, 'height', 'auto')
      important(card, 'min-height', '0')
      important(card, 'overflow', 'visible')

      if (link) {
        important(link, 'position', 'relative')
        important(link, 'display', 'block')
        important(link, 'height', 'auto')
        important(link, 'min-height', '0')
        important(link, 'aspect-ratio', 'auto')
        important(link, 'overflow', 'visible')
      }

      if (overlay) {
        important(overlay, 'position', 'relative')
        important(overlay, 'inset', 'auto')
        important(overlay, 'width', '100%')
        important(overlay, 'height', 'auto')
        important(overlay, 'min-height', '0')
        important(overlay, 'max-height', 'none')
        important(overlay, 'box-sizing', 'border-box')
        important(overlay, 'display', 'block')
        important(overlay, 'padding-top', config.topPad)
        important(overlay, 'overflow', 'visible')
      }

      if (title) {
        important(title, 'display', 'block')
        important(title, 'width', '100%')
        important(title, 'max-width', '100%')
        important(title, 'height', 'auto')
        important(title, 'min-height', '0')
        important(title, 'max-height', 'none')
        important(title, '-webkit-line-clamp', 'unset')
        important(title, '-webkit-box-orient', 'initial')
        important(title, 'overflow', 'visible')
        important(title, 'text-overflow', 'clip')
        important(title, 'white-space', 'normal')
        important(title, 'overflow-wrap', 'normal')
        important(title, 'word-break', 'normal')
        if (mobile) {
          important(title, 'font-size', config.mobileSize)
          important(title, 'line-height', '1')
        }
      }
    })
  })
}

function applyPublicTypeFix() {
  if (/^\/(wp-admin|admin|login|wp-login)/.test(window.location.pathname)) return
  setBodyCopy()
  setLeadTitles()
  setHomepageOverlayTitles()
}

if (typeof window !== 'undefined') {
  const boot = () => {
    let queued = false
    const schedule = () => {
      if (queued) return
      queued = true
      window.requestAnimationFrame(() => {
        queued = false
        applyPublicTypeFix()
      })
    }

    applyPublicTypeFix()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedule, { passive: true })
    window.addEventListener('popstate', schedule)
    window.addEventListener('audiolab:navigation', schedule)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
}
