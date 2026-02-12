-- Review click tracking: snapshot Google review counts before/after sending review requests
CREATE TABLE IF NOT EXISTS review_count_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  review_count INTEGER NOT NULL,
  average_rating NUMERIC(3,2),
  snapshot_type TEXT NOT NULL,  -- 'pre_send' or 'post_check'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_snapshots_hotel_type
  ON review_count_snapshots(hotel_id, snapshot_type, created_at);
