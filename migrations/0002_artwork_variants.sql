ALTER TABLE characters ADD COLUMN artwork_original_key TEXT;
ALTER TABLE characters ADD COLUMN artwork_match_key TEXT;
ALTER TABLE characters ADD COLUMN artwork_gallery_key TEXT;
ALTER TABLE characters ADD COLUMN artwork_avatar_key TEXT;
ALTER TABLE characters ADD COLUMN artwork_focus_x INTEGER NOT NULL DEFAULT 50 CHECK(artwork_focus_x BETWEEN 0 AND 100);
ALTER TABLE characters ADD COLUMN artwork_focus_y INTEGER NOT NULL DEFAULT 50 CHECK(artwork_focus_y BETWEEN 0 AND 100);
ALTER TABLE characters ADD COLUMN artwork_width INTEGER;
ALTER TABLE characters ADD COLUMN artwork_height INTEGER;
