CREATE TABLE t_p48781904_internet_radio_creat.tracks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255),
  filename VARCHAR(500) NOT NULL,
  url TEXT NOT NULL,
  duration INTEGER,
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE t_p48781904_internet_radio_creat.radio_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO t_p48781904_internet_radio_creat.radio_settings (key, value) VALUES
  ('stream_url', ''),
  ('stream_mode', 'playlist'),
  ('admin_password', 'admin123'),
  ('station_name', 'Радио Волна'),
  ('current_track_index', '0');
