import Database from 'better-sqlite3';

export type Db = Database.Database;

const LOG_SQL = `
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (source, external_id)
);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TABLE IF NOT EXISTS pii (ref TEXT PRIMARY KEY, kind TEXT NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS inbound_duplicates (
  source TEXT NOT NULL, external_id TEXT NOT NULL, count INTEGER NOT NULL, last_seen_at TEXT NOT NULL,
  PRIMARY KEY (source, external_id)
);`;

const PROJECTION_TABLES = [
  'people', 'identifiers', 'roles', 'touches', 'opportunities', 'queue_items',
  'entry_points', 'links', 'scans', 'alerts', 'quarantine',
];

const PROJECTION_SQL = `
CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, created_seq INTEGER NOT NULL, display_ref TEXT);
CREATE TABLE IF NOT EXISTS identifiers (
  kind TEXT NOT NULL, hash TEXT NOT NULL, person_id TEXT NOT NULL, pii_ref TEXT, PRIMARY KEY (kind, hash)
);
CREATE TABLE IF NOT EXISTS roles (
  person_id TEXT NOT NULL, role TEXT NOT NULL, unit TEXT NOT NULL, source_seq INTEGER NOT NULL,
  PRIMARY KEY (person_id, role, unit)
);
CREATE TABLE IF NOT EXISTS touches (
  seq INTEGER PRIMARY KEY, person_id TEXT NOT NULL, occurred_at TEXT NOT NULL, source TEXT NOT NULL,
  fields TEXT NOT NULL, code TEXT, is_test INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, product TEXT NOT NULL, unit TEXT NOT NULL, status TEXT NOT NULL,
  opened_seq INTEGER NOT NULL, opened_at TEXT NOT NULL, first_touch_seq INTEGER, last_touch_seq INTEGER,
  attribution_rule TEXT NOT NULL, erp_sale_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_opportunity ON opportunities (person_id, product, unit) WHERE status = 'open';
CREATE TABLE IF NOT EXISTS queue_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, queue TEXT NOT NULL, person_id TEXT,
  reason TEXT NOT NULL, details TEXT NOT NULL, created_seq INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS entry_points (
  code TEXT PRIMARY KEY, unit TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, owner TEXT NOT NULL,
  status TEXT NOT NULL, product TEXT, business_number TEXT
);
CREATE TABLE IF NOT EXISTS links (
  code TEXT PRIMARY KEY, entry_point TEXT NOT NULL, channel TEXT NOT NULL, campaign TEXT NOT NULL, unit TEXT NOT NULL,
  product TEXT NOT NULL, destination TEXT NOT NULL, link_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scans (code TEXT PRIMARY KEY, count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entry_point TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL,
  action TEXT NOT NULL, owner TEXT NOT NULL, created_seq INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS quarantine (seq INTEGER PRIMARY KEY, error TEXT NOT NULL);`;

export function openDb(path = ':memory:'): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('recursive_triggers = ON');
  db.exec(LOG_SQL);
  db.exec(PROJECTION_SQL);
  return db;
}

// Drops only derived tables; the log, the vault and the duplicate counter stay.
export function resetProjections(db: Db): void {
  db.exec(PROJECTION_TABLES.map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n'));
  db.exec(PROJECTION_SQL);
}
