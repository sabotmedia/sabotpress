CREATE TABLE IF NOT EXISTS campaign_contributors (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  byline TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  permissions_json TEXT NOT NULL DEFAULT '{}',
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_contributor_sessions (
  id TEXT PRIMARY KEY,
  contributor_id TEXT NOT NULL,
  session_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  contributor_id TEXT,
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'sent',
  reply_to_id TEXT,
  reuse_social INTEGER NOT NULL DEFAULT 0,
  reuse_original INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_questions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  question TEXT NOT NULL,
  submitter_name TEXT NOT NULL DEFAULT 'Anonymous',
  submitter_contact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  editor_note TEXT NOT NULL DEFAULT '',
  message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaign_contributors_campaign ON campaign_contributors(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_sessions_hash ON campaign_contributor_sessions(session_hash);
CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign ON campaign_messages(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_questions_campaign ON campaign_questions(campaign_id, status, created_at DESC);
