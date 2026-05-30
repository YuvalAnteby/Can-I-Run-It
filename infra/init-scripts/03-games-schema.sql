-- ============================================
-- GAME ENGINES
-- ============================================

CREATE TABLE IF NOT EXISTS game_engines (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,   -- 'Unreal Engine 5', 'Unity', 'REDengine 4'
  version VARCHAR(50),          -- '5.1', '2022.3' — nullable, not always known
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(name, version)
);

-- ============================================
-- GAMES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,   -- 'cyberpunk-2077', used in URLs
  name VARCHAR(200) NOT NULL,

  -- Relations
  game_engine_id INTEGER REFERENCES game_engines(id),

  -- Meta
  publisher VARCHAR(200),
  developer VARCHAR(200),
  release_date DATE,
  genre VARCHAR(100),           -- 'Action RPG', 'FPS', 'Open World'
  description TEXT,
  tags TEXT[],                  -- ['ray-tracing', 'open-world', 'cpu-heavy']

  -- Tech flags (ML features + UI display)
  supports_ray_tracing BOOLEAN DEFAULT false,
  supports_dlss BOOLEAN DEFAULT false,
  supports_fsr BOOLEAN DEFAULT false,
  supports_xess BOOLEAN DEFAULT false,

  -- Media
  cover_image_url TEXT,

  -- Homepage ordering
  is_trending BOOLEAN DEFAULT false,
  trending_rank INTEGER,         -- Lower = higher on the list, NULL = not trending

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- GAME REQUIREMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS game_requirements (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,

  -- e.g. 'minimum', 'recommended', '1440p recommended', '4K ultra', 'competitive'
  tier VARCHAR(50) NOT NULL,

  -- Human readable explanation of what this tier targets
  -- e.g. 'For 60fps at 1080p High settings'
  description TEXT,

  -- Hardware targets — nullable because devs often say "equivalent of X"
  -- If null, it means no specific model is referenced (rely on notes or benchmarks)
  cpu_id INTEGER REFERENCES cpus(id) ON DELETE SET NULL,
  gpu_id INTEGER REFERENCES gpus(id) ON DELETE SET NULL,

  -- Other requirements
  ram_gb INTEGER NOT NULL,
  vram_gb INTEGER,
  storage_gb INTEGER,
  requires_ssd BOOLEAN DEFAULT false,

  -- Target resolution and framerate this tier is tuned for
  resolution_width INTEGER DEFAULT 1920,
  resolution_height INTEGER DEFAULT 1080,
  target_fps INTEGER DEFAULT 30,

  -- Soft requirements: DirectX version, OS, driver notes, etc.
  notes TEXT,

  UNIQUE(game_id, tier)
);