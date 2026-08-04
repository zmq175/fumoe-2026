PRAGMA defer_foreign_keys = ON;

CREATE TABLE tournament_rounds_next (
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL CHECK(stage IN ('swiss','knockout')),
  round_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','closed','archived')),
  season_id TEXT NOT NULL REFERENCES seasons(id),
  UNIQUE(season_id, stage, round_number)
);

CREATE TABLE matches_next (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES tournament_rounds_next(id),
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

CREATE TABLE votes_next (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches_next(id),
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

CREATE TABLE risk_events_next (
  id TEXT PRIMARY KEY,
  vote_id TEXT REFERENCES votes_next(id),
  user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  score INTEGER NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tournament_rounds_next(id,stage,round_number,name,starts_at,ends_at,status,season_id)
SELECT id,stage,round_number,name,starts_at,ends_at,status,season_id FROM tournament_rounds;

INSERT INTO matches_next(id,round_id,group_code,bracket_position,left_character_id,right_character_id,left_votes,right_votes,status,winner_character_id,published_at,updated_at)
SELECT id,round_id,group_code,bracket_position,left_character_id,right_character_id,left_votes,right_votes,status,winner_character_id,published_at,updated_at FROM matches;

INSERT INTO votes_next(id,match_id,voter_id,character_id,risk_status,ip_hash,device_hash,created_at,reviewed_at,reviewed_by,review_note)
SELECT id,match_id,voter_id,character_id,risk_status,ip_hash,device_hash,created_at,reviewed_at,reviewed_by,review_note FROM votes;

INSERT INTO risk_events_next(id,vote_id,user_id,event_type,score,detail_json,created_at)
SELECT id,vote_id,user_id,event_type,score,detail_json,created_at FROM risk_events;

DROP TABLE risk_events;
DROP TABLE votes;
DROP TABLE matches;
DROP TABLE tournament_rounds;

ALTER TABLE tournament_rounds_next RENAME TO tournament_rounds;
ALTER TABLE matches_next RENAME TO matches;
ALTER TABLE votes_next RENAME TO votes;
ALTER TABLE risk_events_next RENAME TO risk_events;

CREATE INDEX tournament_rounds_season_idx ON tournament_rounds(season_id,starts_at);
CREATE INDEX matches_round_idx ON matches(round_id);
CREATE INDEX votes_match_idx ON votes(match_id,risk_status);
CREATE INDEX votes_voter_idx ON votes(voter_id,created_at DESC);
CREATE INDEX risk_events_user_idx ON risk_events(user_id,created_at DESC);
