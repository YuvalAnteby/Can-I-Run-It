-- ENUMS (Standardizing inputs for ML)
-- ============================================

-- Hardware brands
CREATE TYPE hardware_brand AS ENUM ('nvidia', 'amd', 'intel');

-- Custom settings aren't supported now
CREATE TYPE setting_preset AS ENUM ('low', 'medium', 'high', 'ultra');

CREATE TYPE upscaler_type AS ENUM ('off', 'dlss', 'fsr', 'xess');
CREATE TYPE upscaler_quality_mode AS ENUM ('quality', 'balanced', 'performance', 'ultra_performance');