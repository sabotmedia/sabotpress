CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'unknown',
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
ON audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
ON audit_log(entity_type, entity_id);
