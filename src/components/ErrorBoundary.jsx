import React from 'react'
import { Link } from 'react-router-dom'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Route render failed', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    const isAdmin = this.props.area === 'admin'
    return (
      <main className={`page error-boundary-page${isAdmin ? ' error-boundary-page--admin' : ''}`} role="alert">
        <section className={isAdmin ? 'wp-meta-box' : 'missing-state'}>
          <p className="project-hero__eyebrow">{isAdmin ? 'admin error' : 'site error'}</p>
          <h1>Something went wrong</h1>
          <p>
            This view failed to render. Try refreshing the page; if it repeats, capture the route and recent action for QA.
          </p>
          <div className="not-found-page__actions">
            <button className="button button--primary" type="button" onClick={() => window.location.reload()}>
              Refresh
            </button>
            <Link className="button" to={isAdmin ? '/wp-admin' : '/'}>Go back</Link>
          </div>
        </section>
      </main>
    )
  }
}
