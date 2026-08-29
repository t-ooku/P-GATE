-- Keep an explicit destination for member notifications. HOSHILU INSIGHT
-- stores an opaque, same-origin saved-search deep link here; the raw search
-- text is deliberately not embedded in the URL.
ALTER TABLE mywatch_notifications ADD COLUMN result_url TEXT NOT NULL DEFAULT '';
