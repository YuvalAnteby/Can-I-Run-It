-- ============================================
-- GPUS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS gpus (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  manufacturer hardware_brand NOT NULL, -- Nvidia, AMD, Intel as enum

  -- Quantitative Specs
  vram_gb INTEGER NOT NULL,
  cuda_cores INTEGER, -- Or "shading_units" for generic term
  tensor_cores INTEGER DEFAULT 0, -- Crucial for DLSS prediction
  base_clock_mhz INTEGER,
  boost_clock_mhz INTEGER,
  memory_bus_width INTEGER,
  
  -- Benchmarks stored as flexible data here: {"timespy": 8700, "firestrike": 15000}
  benchmarks JSONB DEFAULT '{}'::jsonb,

  -- Market
  release_date DATE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CPUS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS cpus (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  manufacturer hardware_brand NOT NULL, -- Intel, AMD

  -- Specs
  cores INTEGER NOT NULL,
  threads INTEGER NOT NULL,
  base_clock_ghz FLOAT NOT NULL,
  boost_clock_ghz FLOAT,
  l3_cache_mb INTEGER,
  
  -- Benchmarks stored as flexible data here: {"timespy": 8700, "firestrike": 15000}
  benchmarks JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- GIN Indexes allow fast querying inside the JSONB blob
CREATE INDEX idx_gpus_benchmarks ON gpus USING GIN (benchmarks);
CREATE INDEX idx_cpus_benchmarks ON cpus USING GIN (benchmarks);
