ALTER TABLE characters ADD COLUMN artwork_gallery_crop_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}';
ALTER TABLE characters ADD COLUMN artwork_match_crop_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}';
ALTER TABLE characters ADD COLUMN artwork_avatar_crop_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}';
