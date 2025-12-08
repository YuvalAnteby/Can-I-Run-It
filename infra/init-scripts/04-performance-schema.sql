-- ============================================
-- PERFORMANCE RECORDS (The Training Set)
-- ============================================
CREATE TABLE IF NOT EXISTS performance_records (
  id SERIAL PRIMARY KEY,

  -- Relationships
  game_id INTEGER NOT NULL REFERENCES games(id),
  gpu_id INTEGER NOT NULL REFERENCES gpus(id),
  cpu_id INTEGER NOT NULL REFERENCES cpus(id),

  -- RAM
  ram_gb INTEGER NOT NULL,
  ram_mhz INTEGER, -- Optional, can help in some cases
  
  -- Resolution
  res_width INTEGER NOT NULL,   -- e.g. 1920
  res_height INTEGER NOT NULL,  -- e.g. 1080
  
  -- Settings
  settings setting_preset NOT NULL, -- uses ENUM
  
  -- Upscaling (Massive impact on modern FPS)
  upscaler upscaler_type DEFAULT 'off',
  upscaler_quality upscaler_quality_mode,

  -- The Target Variable (Label)
  fps_avg FLOAT NOT NULL,
  fps_1_percent_low FLOAT,

  -- Metadata
  verified BOOLEAN DEFAULT false,
  source_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Speed up ML Data Export
CREATE INDEX idx_perf_lookup ON performance_records(game_id, resolution_width, resolution_height, settings);