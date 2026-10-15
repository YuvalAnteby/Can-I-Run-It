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
  upscaler_quality upscaler_quality_mode, -- NULL when upscaler = 'off'

  -- The Target Variable (Label)
  fps_avg FLOAT NOT NULL,
  fps_1_percent_low FLOAT,  -- Perceived smoothness signal, important for UX

  -- Data Quality
  verified BOOLEAN DEFAULT false,
  source VARCHAR(50) NOT NULL DEFAULT 'measured',
  source_url TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE performance_records ADD COLUMN IF NOT EXISTS source VARCHAR(50);
UPDATE performance_records SET source = 'measured' WHERE source IS NULL;
ALTER TABLE performance_records ALTER COLUMN source SET DEFAULT 'measured';
ALTER TABLE performance_records ALTER COLUMN source SET NOT NULL;

-- Composite index for the most common lookup pattern:
-- "give me all records for this game at this resolution and settings"
CREATE INDEX idx_perf_lookup ON performance_records(game_id, res_width, res_height, settings);
 
-- Separate indexes for hardware-based lookups
-- (e.g. "how does this GPU perform across all games")
CREATE INDEX idx_perf_gpu ON performance_records(gpu_id);
CREATE INDEX idx_perf_cpu ON performance_records(cpu_id);
