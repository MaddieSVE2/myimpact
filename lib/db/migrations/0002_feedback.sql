CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  page_url TEXT,
  category TEXT,
  message TEXT NOT NULL,
  name TEXT,
  email TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
