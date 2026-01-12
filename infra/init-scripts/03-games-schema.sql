-- ============================================
-- GAME ENGINES
-- ============================================
CREATE TABLE IF NOT EXISTS game_engines (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL, -- 'Unreal Engine', 'Unity'
  version VARCHAR(50),        -- '5.1', '2022.3'
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(name, version)
);

-- ============================================
-- GAMES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  
  -- ML Feature: The Engine often dictates CPU vs GPU load
  game_engine_id INTEGER REFERENCES game_engines(id),
  
  publisher VARCHAR(200),
  developer VARCHAR(200),
  release_date DATE,
  
  -- Tech Features
  supports_ray_tracing BOOLEAN DEFAULT false,
  supports_dlss BOOLEAN DEFAULT false,
  supports_fsr BOOLEAN DEFAULT false,
  
  -- Media / Meta
  cover_image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);