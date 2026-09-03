import { AdminFrame } from './AdminRail'
import { WpAnalyticsWidgets } from './WpAnalyticsWidgets'

export function AnalyticsPage({ pieces = [] }) {
  return (
    <AdminFrame>
      <main className="page wp-admin-screen">
        <div className="wp-screen-header">
          <h1>Analytics</h1>
        </div>

        <p className="wp-screen-description">
          Live, first-party traffic data for the public SabotPress site.
        </p>

        <WpAnalyticsWidgets pieces={pieces} />
      </main>
    </AdminFrame>
  )
}
