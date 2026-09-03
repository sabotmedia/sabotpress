CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  page_title TEXT NOT NULL DEFAULT '',
  session_hash TEXT NOT NULL,
  referrer_host TEXT NOT NULL DEFAULT '',
  referrer_path TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'direct',
  medium TEXT NOT NULL DEFAULT 'none',
  campaign TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop',
  browser TEXT NOT NULL DEFAULT 'other',
  country TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'pageview'
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_time ON analytics_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_day ON analytics_events(day);
CREATE INDEX IF NOT EXISTS idx_analytics_events_path ON analytics_events(path);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(day, session_hash);
