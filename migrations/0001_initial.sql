PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'voter' CHECK(role IN ('voter','operator','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','frozen','deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS auth_challenges_email_idx ON auth_challenges(email, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_challenges_ip_idx ON auth_challenges(ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  publisher TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  group_code TEXT,
  seed INTEGER,
  artwork_key TEXT,
  artwork_source_url TEXT,
  artwork_source_note TEXT,
  artwork_verified_at TEXT,
  artwork_verified_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS characters_game_idx ON characters(game_id);

CREATE TABLE IF NOT EXISTS tournament_rounds (
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL CHECK(stage IN ('swiss','knockout')),
  round_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','closed','archived')),
  UNIQUE(stage, round_number)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES tournament_rounds(id),
  group_code TEXT,
  bracket_position INTEGER,
  left_character_id TEXT NOT NULL REFERENCES characters(id),
  right_character_id TEXT NOT NULL REFERENCES characters(id),
  left_votes INTEGER NOT NULL DEFAULT 0,
  right_votes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','closed','review')),
  winner_character_id TEXT REFERENCES characters(id),
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS matches_round_idx ON matches(round_id);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  voter_id TEXT NOT NULL REFERENCES users(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  risk_status TEXT NOT NULL DEFAULT 'approved' CHECK(risk_status IN ('approved','pending','rejected','revoked')),
  ip_hash TEXT NOT NULL,
  device_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_note TEXT,
  UNIQUE(match_id, voter_id)
);
CREATE INDEX IF NOT EXISTS votes_match_idx ON votes(match_id, risk_status);
CREATE INDEX IF NOT EXISTS votes_voter_idx ON votes(voter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS risk_events (
  id TEXT PRIMARY KEY,
  vote_id TEXT REFERENCES votes(id),
  user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  score INTEGER NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS risk_events_user_idx ON risk_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('operator','admin')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  invited_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO settings(key, value) VALUES
 ('tournament_name', '府萌 2026'),
 ('live_url', 'https://live.bilibili.com/21195828'),
 ('timezone', 'Asia/Shanghai'),
 ('privacy_text_version', '1'),
 ('rules_version', '1');
