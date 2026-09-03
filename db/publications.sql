CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_publications_status ON publications(status);

CREATE TABLE IF NOT EXISTS publication_issues (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  title TEXT NOT NULL,
  issue_order INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_publication_issues_publication ON publication_issues(publication_id, issue_order);

CREATE TABLE IF NOT EXISTS publication_sections (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  issue_id TEXT,
  title TEXT NOT NULL,
  section_order INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE,
  FOREIGN KEY (issue_id) REFERENCES publication_issues(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_publication_sections_publication ON publication_sections(publication_id, section_order);

CREATE TABLE IF NOT EXISTS publication_pages (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  issue_id TEXT,
  section_id TEXT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'inside',
  orientation TEXT NOT NULL DEFAULT 'portrait',
  page_order INTEGER NOT NULL DEFAULT 0,
  blocks_json TEXT NOT NULL DEFAULT '[]',
  thumbnail TEXT,
  preview_image TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_publication_pages_publication ON publication_pages(publication_id, page_order);

CREATE TABLE IF NOT EXISTS publication_print_editions (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  reader_order_json TEXT NOT NULL DEFAULT '[]',
  printer_order_json TEXT NOT NULL DEFAULT '[]',
  imposed_booklet_json TEXT NOT NULL DEFAULT '[]',
  single_pages_json TEXT NOT NULL DEFAULT '[]',
  print_pdf TEXT,
  imposed_pdf TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS publication_digital_editions (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  reader_pdf TEXT,
  reader_assets_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE
);
