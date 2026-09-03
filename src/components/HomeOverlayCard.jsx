import { Link } from 'react-router-dom'

export function HomeOverlayCard({ item, variant = 'recent', formatDate }) {
  const isHero = variant === 'hero'
  const Heading = isHero ? 'h1' : 'h2'
  const published = formatDate(item.publishedAt || item.updatedAt)

  return (
    <article className={`home-overlay-card home-overlay-card--${isHero ? 'hero' : 'recent'}`}>
      <Link className="home-overlay-card__link" to={item.href}>
        <div
          className="home-overlay-card__image"
          aria-hidden="true"
          style={{
            backgroundImage: `url("${item.imageUrl}")`,
          }}
        />
        <div className="home-overlay-card__content">
          <div className="home-overlay-card__meta">
            {published ? <span>{published}</span> : null}
            <span>{item.target}</span>
            {isHero ? <span>{item.contentType}</span> : null}
          </div>
          <Heading className="home-overlay-card__title">{item.title}</Heading>
        </div>
      </Link>
    </article>
  )
}
