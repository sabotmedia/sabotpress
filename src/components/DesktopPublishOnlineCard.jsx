import { Link, useSearchParams } from 'react-router-dom'
import { adminRoutes } from '../routing/routes'

export function DesktopPublishOnlineCard() {
  const [searchParams] = useSearchParams()
  const desktop = typeof window !== 'undefined' && Boolean(window.sabotDesktop?.isDesktop)
  const requested = searchParams.get('desktop-publish') === '1'
  if (!desktop) return null

  return (
    <section className={`wp-meta-box desktop-publish-card${requested ? ' is-highlighted' : ''}`}>
      <div className="wp-screen-header">
        <div>
          <div className="review-summary-card__eyebrow">desktop edition</div>
          <h2>Publish Online</h2>
          <p className="description">Your publication works on this computer without hosting. When you want a public website, pick the route that fits what you have. A custom domain is optional.</p>
        </div>
      </div>

      <div className="desktop-publish-card__options">
        <article>
          <strong>$0 public hosting</strong>
          <p>Use a free hosting tier and its provided address. SabotPress currently documents Cloudflare Pages as the supported no-cost production route. You can add your own domain later.</p>
          <div className="review-card__actions"><a className="button button--primary" href="/help.html#free-hosting">Free setup instructions</a></div>
        </article>
        <article>
          <strong>I already own a domain</strong>
          <p>Keep the hosting free and attach the domain you already pay for. SabotPress shows the exact DNS target supplied by the host instead of assuming one provider.</p>
          <div className="review-card__actions"><Link className="button" to={adminRoutes.sites}>Connect my domain</Link></div>
        </article>
        <article>
          <strong>Community or collective host</strong>
          <p>A compatible host can run SabotPress for you. This is the closest model to Noblogs: somebody else handles the server while you just publish.</p>
          <div className="review-card__actions"><a className="button" href="/help.html#community-hosting">What to ask a host</a></div>
        </article>
        <article>
          <strong>My own server</strong>
          <p>Use Docker/VPS deployment when you actually want to manage infrastructure. This is an advanced route, not homework for everybody else.</p>
          <div className="review-card__actions"><a className="button" href="/help.html#server">Server install guide</a></div>
        </article>
      </div>

      <p className="description"><strong>Cost rule:</strong> SabotPress should always offer a $0 route to a public site where a supported free host is available. Buying a custom domain is optional.</p>
    </section>
  )
}
