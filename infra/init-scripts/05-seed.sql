-- ============================================
-- SEED DATA — CIRI
-- Rebuilt from hand-verified source CSVs
-- Run order: 01-enums → 02-hardware → 03-games → 04-performance → 05-seed
-- ============================================


-- ============================================
-- GAME ENGINES
-- ============================================

INSERT INTO game_engines (name, version) VALUES
  ('REDengine', '4'),
  ('RAGE', NULL),
  ('Unreal Engine', '4'),
  ('Unreal Engine', '5'),
  ('Decima', NULL);


-- ============================================
-- GPUS (43 Nvidia GPUs — hand-verified source data)
-- Note: AMD and Intel GPUs to be added later
-- ============================================

INSERT INTO gpus (slug, name, manufacturer, vram_gb, shading_units, tensor_cores, base_clock_mhz, boost_clock_mhz, memory_bus_width, benchmarks, release_year) VALUES
  ('nvidia-rtx-4080-super', 'NVIDIA GeForce RTX 4080 Super', 'Nvidia', 16, 10240, 320, 2295, 2550, 256, '{"port_royal": 18500, "timespy_extreme": 14200}'::jsonb, 2024),
  ('nvidia-rtx-5090', 'NVIDIA GeForce RTX 5090', 'Nvidia', 32, 21760, 680, 2010, 2410, 512, '{"port_royal": 33000, "timespy_extreme": 28500}'::jsonb, 2025),
  ('nvidia-rtx-5080', 'NVIDIA GeForce RTX 5080', 'Nvidia', 16, 10752, 336, 2300, 2620, 256, '{"port_royal": 21500, "timespy_extreme": 17200}'::jsonb, 2025),
  ('nvidia-rtx-5070-ti', 'NVIDIA GeForce RTX 5070 Ti', 'Nvidia', 16, 8960, 280, 2300, 2450, 256, '{"port_royal": 19045, "timespy_extreme": 13485}'::jsonb, 2025),
  ('nvidia-rtx-5070', 'NVIDIA GeForce RTX 5070', 'Nvidia', 12, 6144, 192, 2330, 2510, 192, '{"port_royal": 13975, "timespy_extreme": 10675}'::jsonb, 2025),
  ('nvidia-rtx-5060-ti', 'NVIDIA GeForce RTX 5060 Ti', 'Nvidia', 16, 4608, 144, 2410, 2570, 128, '{"port_royal": 9944, "timespy_extreme": 7136}'::jsonb, 2025),
  ('nvidia-rtx-5060', 'NVIDIA GeForce RTX 5060', 'Nvidia', 8, 3840, 120, 2280, 2500, 128, '{"port_royal": 8630, "timespy_extreme": 6306}'::jsonb, 2025),
  ('nvidia-rtx-5050', 'NVIDIA GeForce RTX 5050', 'Nvidia', 8, 2560, 80, 2310, 2570, 128, '{"port_royal": 6124}'::jsonb, 2025),
  ('nvidia-rtx-4090', 'NVIDIA GeForce RTX 4090', 'Nvidia', 24, 16384, 512, 2235, 2520, 384, '{"port_royal": 25000, "timespy_extreme": 19500}'::jsonb, 2022),
  ('nvidia-rtx-4080', 'NVIDIA GeForce RTX 4080', 'Nvidia', 16, 9728, 304, 2205, 2505, 256, '{"port_royal": 17800, "timespy_extreme": 13800}'::jsonb, 2022),
  ('nvidia-rtx-4070-ti-super', 'NVIDIA GeForce RTX 4070 Ti Super', 'Nvidia', 16, 8448, 264, 2340, 2610, 256, '{"port_royal": 15500, "timespy_extreme": 11800}'::jsonb, 2024),
  ('nvidia-rtx-4070-ti', 'NVIDIA GeForce RTX 4070 Ti', 'Nvidia', 12, 7680, 240, 2310, 2610, 192, '{"port_royal": 14200, "timespy_extreme": 11000}'::jsonb, 2023),
  ('nvidia-rtx-4070-super', 'NVIDIA GeForce RTX 4070 Super', 'Nvidia', 12, 7168, 224, 1980, 2475, 192, '{"port_royal": 13000, "timespy_extreme": 10200}'::jsonb, 2024),
  ('nvidia-rtx-4070', 'NVIDIA GeForce RTX 4070', 'Nvidia', 12, 5888, 184, 1920, 2475, 192, '{"port_royal": 11200, "timespy_extreme": 8600}'::jsonb, 2023),
  ('nvidia-rtx-4060-ti-16gb', 'NVIDIA GeForce RTX 4060 Ti (16GB)', 'Nvidia', 16, 4352, 136, 2310, 2535, 128, '{"port_royal": 8100, "timespy_extreme": 6200}'::jsonb, 2023),
  ('nvidia-rtx-4060-ti-8gb', 'NVIDIA GeForce RTX 4060 Ti (8GB)', 'Nvidia', 8, 4352, 136, 2310, 2535, 128, '{"port_royal": 8000, "timespy_extreme": 6100}'::jsonb, 2023),
  ('nvidia-rtx-4060', 'NVIDIA GeForce RTX 4060', 'Nvidia', 8, 3072, 96, 1830, 2460, 128, '{"port_royal": 6000, "timespy_extreme": 4900}'::jsonb, 2023),
  ('nvidia-rtx-3090-ti', 'NVIDIA GeForce RTX 3090 Ti', 'Nvidia', 24, 10752, 336, 1670, 1860, 384, '{"port_royal": 15000, "timespy_extreme": 11400}'::jsonb, 2022),
  ('nvidia-rtx-3090', 'NVIDIA GeForce RTX 3090', 'Nvidia', 24, 10496, 328, 1395, 1695, 384, '{"port_royal": 13500, "timespy_extreme": 10200}'::jsonb, 2020),
  ('nvidia-rtx-3080-12gb', 'NVIDIA GeForce RTX 3080 (12GB)', 'Nvidia', 12, 8960, 280, 1260, 1710, 384, '{"port_royal": 11800, "timespy_extreme": 8800}'::jsonb, 2022),
  ('nvidia-rtx-3080', 'NVIDIA GeForce RTX 3080', 'Nvidia', 10, 8704, 272, 1440, 1710, 320, '{"port_royal": 11500, "timespy_extreme": 8000}'::jsonb, 2020),
  ('nvidia-rtx-3070-ti', 'NVIDIA GeForce RTX 3070 Ti', 'Nvidia', 8, 6144, 192, 1575, 1770, 256, '{"port_royal": 8600, "timespy_extreme": 7500}'::jsonb, 2021),
  ('nvidia-rtx-3070', 'NVIDIA GeForce RTX 3070', 'Nvidia', 8, 5888, 184, 1500, 1725, 256, '{"port_royal": 8100, "timespy_extreme": 6900}'::jsonb, 2020),
  ('nvidia-rtx-3060-ti', 'NVIDIA GeForce RTX 3060 Ti', 'Nvidia', 8, 4864, 152, 1410, 1665, 256, '{"port_royal": 6900, "timespy_extreme": 5900}'::jsonb, 2020),
  ('nvidia-rtx-3060-12gb', 'NVIDIA GeForce RTX 3060 (12GB)', 'Nvidia', 12, 3584, 112, 1320, 1777, 192, '{"port_royal": 5100, "timespy_extreme": 4200}'::jsonb, 2021),
  ('nvidia-rtx-3060-8gb', 'NVIDIA GeForce RTX 3060 (8GB)', 'Nvidia', 8, 3584, 112, 1320, 1777, 128, '{"port_royal": 4600, "timespy_extreme": 3800}'::jsonb, 2022),
  ('nvidia-rtx-3050', 'NVIDIA GeForce RTX 3050', 'Nvidia', 8, 2560, 80, 1552, 1777, 128, '{"port_royal": 3500, "timespy_extreme": 2300}'::jsonb, 2022),
  ('nvidia-rtx-2080-ti', 'NVIDIA GeForce RTX 2080 Ti', 'Nvidia', 11, 4352, 544, 1350, 1545, 352, '{"port_royal": 8500, "timespy_extreme": 6600}'::jsonb, 2018),
  ('nvidia-rtx-2080-super', 'NVIDIA GeForce RTX 2080 Super', 'Nvidia', 8, 3072, 384, 1650, 1815, 256, '{"port_royal": 7000, "timespy_extreme": 5400}'::jsonb, 2019),
  ('nvidia-rtx-2080', 'NVIDIA GeForce RTX 2080', 'Nvidia', 8, 2944, 368, 1515, 1710, 256, '{"port_royal": 6500, "timespy_extreme": 5000}'::jsonb, 2018),
  ('nvidia-rtx-2070-super', 'NVIDIA GeForce RTX 2070 Super', 'Nvidia', 8, 2560, 320, 1605, 1770, 256, '{"port_royal": 6000, "timespy_extreme": 4800}'::jsonb, 2019),
  ('nvidia-rtx-2070', 'NVIDIA GeForce RTX 2070', 'Nvidia', 8, 2304, 288, 1410, 1620, 256, '{"port_royal": 5000, "timespy_extreme": 4200}'::jsonb, 2018),
  ('nvidia-rtx-2060-super', 'NVIDIA GeForce RTX 2060 Super', 'Nvidia', 8, 2176, 272, 1470, 1650, 256, '{"port_royal": 4500, "timespy_extreme": 4000}'::jsonb, 2019),
  ('nvidia-rtx-2060', 'NVIDIA GeForce RTX 2060', 'Nvidia', 6, 1920, 240, 1365, 1680, 192, '{"port_royal": 4000, "timespy_extreme": 3600}'::jsonb, 2019),
  ('nvidia-gtx-1080-ti', 'NVIDIA GeForce GTX 1080 Ti', 'Nvidia', 11, 3584, 0, 1480, 1582, 352, '{"timespy_extreme": 4600}'::jsonb, 2017),
  ('nvidia-gtx-1080', 'NVIDIA GeForce GTX 1080', 'Nvidia', 8, 2560, 0, 1607, 1733, 256, '{"timespy_extreme": 3450}'::jsonb, 2016),
  ('nvidia-gtx-1070-ti', 'NVIDIA GeForce GTX 1070 Ti', 'Nvidia', 8, 2432, 0, 1607, 1683, 256, '{"timespy_extreme": 3140}'::jsonb, 2017),
  ('nvidia-gtx-1070', 'NVIDIA GeForce GTX 1070', 'Nvidia', 8, 1920, 0, 1506, 1683, 256, '{"timespy_extreme": 2800}'::jsonb, 2016),
  ('nvidia-gtx-1060-6gb', 'NVIDIA GeForce GTX 1060 (6GB)', 'Nvidia', 6, 1280, 0, 1506, 1708, 192, '{"timespy_extreme": 1950}'::jsonb, 2016),
  ('nvidia-rtx-3080-ti', 'NVIDIA GeForce RTX 3080 Ti', 'Nvidia', 12, 10240, 320, 1365, 1665, 384, '{"port_royal": 13000, "timespy_extreme": 9600}'::jsonb, 2021),
  ('nvidia-gtx-1060-3gb', 'NVIDIA GeForce GTX 1060 (3GB)', 'Nvidia', 3, 1152, 0, 1506, 1708, 192, '{"timespy_extreme": 1800}'::jsonb, 2016),
  ('nvidia-gtx-1050-ti', 'NVIDIA GeForce GTX 1050 Ti', 'Nvidia', 4, 768, 0, 1290, 1392, 128, '{"timespy_extreme": 1100}'::jsonb, 2016),
  ('nvidia-gtx-1050', 'NVIDIA GeForce GTX 1050', 'Nvidia', 2, 640, 0, 1354, 1455, 128, '{"timespy_extreme": 700}'::jsonb, 2016);


-- ============================================
-- CPUS (10 CPUs covering budget → flagship)
-- ============================================

INSERT INTO cpus (slug, name, manufacturer, cores, threads, base_clock_ghz, boost_clock_ghz, l3_cache_mb, tdp_watts, benchmarks, release_year) VALUES
  ('intel-core-i5-10400f', 'Intel Core i5-10400F', 'Intel', 6, 12, 2.9, 4.3, 12, 65,
   '{"cinebench_r23_single": 1250, "cinebench_r23_multi": 7500, "passmark": 12800}'::jsonb, 2020),
  ('intel-core-i5-12400f', 'Intel Core i5-12400F', 'Intel', 6, 12, 2.5, 4.4, 18, 65,
   '{"cinebench_r23_single": 1750, "cinebench_r23_multi": 11000, "passmark": 20500}'::jsonb, 2021),
  ('intel-core-i5-13600k', 'Intel Core i5-13600K', 'Intel', 14, 20, 3.5, 5.1, 24, 125,
   '{"cinebench_r23_single": 2000, "cinebench_r23_multi": 19500, "passmark": 36000}'::jsonb, 2022),
  ('intel-core-i7-13700k', 'Intel Core i7-13700K', 'Intel', 16, 24, 3.4, 5.4, 30, 125,
   '{"cinebench_r23_single": 2100, "cinebench_r23_multi": 24000, "passmark": 40000}'::jsonb, 2022),
  ('intel-core-i9-13900k', 'Intel Core i9-13900K', 'Intel', 24, 32, 3.0, 5.8, 36, 125,
   '{"cinebench_r23_single": 2250, "cinebench_r23_multi": 38000, "passmark": 58000}'::jsonb, 2022),
  ('amd-ryzen-5-5600x', 'AMD Ryzen 5 5600X', 'AMD', 6, 12, 3.7, 4.6, 32, 65,
   '{"cinebench_r23_single": 1640, "cinebench_r23_multi": 10500, "passmark": 19500}'::jsonb, 2020),
  ('amd-ryzen-5-7600x', 'AMD Ryzen 5 7600X', 'AMD', 6, 12, 4.7, 5.3, 32, 105,
   '{"cinebench_r23_single": 1990, "cinebench_r23_multi": 14500, "passmark": 30000}'::jsonb, 2022),
  ('amd-ryzen-7-5800x3d', 'AMD Ryzen 7 5800X3D', 'AMD', 8, 16, 3.4, 4.5, 96, 105,
   '{"cinebench_r23_single": 1580, "cinebench_r23_multi": 12000, "passmark": 24000}'::jsonb, 2022),
  ('amd-ryzen-7-7800x3d', 'AMD Ryzen 7 7800X3D', 'AMD', 8, 16, 4.2, 5.0, 96, 120,
   '{"cinebench_r23_single": 1850, "cinebench_r23_multi": 17500, "passmark": 34000}'::jsonb, 2023),
  ('amd-ryzen-9-7950x3d', 'AMD Ryzen 9 7950X3D', 'AMD', 16, 32, 4.2, 5.7, 128, 120,
   '{"cinebench_r23_single": 2100, "cinebench_r23_multi": 38000, "passmark": 60000}'::jsonb, 2023);


-- ============================================
-- GAMES (10 games from hand-verified source)
-- ============================================

INSERT INTO games (
  slug, name, publisher, developer, release_date,
  genre, description, tags,
  supports_ray_tracing, supports_dlss, supports_fsr, supports_xess,
  cover_image_url, is_trending, trending_rank
) VALUES
  ('kingdom-come-deliverance-2', 'Kingdom Come Deliverance 2', 'Deep Silver', 'Warhorse Studios', '2025-02-11', 'Action RPG', 'A realistic open-world RPG set in medieval Bohemia. The sequel to the acclaimed Kingdom Come: Deliverance.', ARRAY['open-world', 'realistic', 'cpu-heavy', 'dlss', 'fsr'], true, true, true, false, 'https://imgur.com/TqcyNA9.jpg', true, 1),
  ('god-of-war-2018', 'God of War (2018)', 'Sony Interactive Entertainment', 'Santa Monica Studio', '2018-04-20', 'Action Adventure', 'Kratos and his son Atreus journey through the Norse realms. A masterpiece of storytelling and combat.', ARRAY['story-rich', 'action', 'dlss'], false, true, true, false, 'https://imgur.com/TxGGC6O.jpg', false, NULL),
  ('god-of-war-ragnarok', 'God of War Ragnarök', 'Sony Interactive Entertainment', 'Santa Monica Studio', '2022-11-09', 'Action Adventure', 'The epic conclusion to the Norse saga. Kratos and Atreus must prevent Ragnarök.', ARRAY['story-rich', 'action', 'dlss'], false, true, true, false, 'https://imgur.com/CyHn5T3.jpg', false, NULL),
  ('kingdom-come-deliverance', 'Kingdom Come: Deliverance', 'Deep Silver', 'Warhorse Studios', '2018-02-13', 'Action RPG', 'A story-driven open-world RPG in medieval Bohemia. Historically accurate with deep RPG systems.', ARRAY['open-world', 'realistic', 'cpu-heavy'], false, false, false, false, 'https://imgur.com/q1aVXnw.jpg', false, NULL),
  ('red-dead-redemption-2', 'Red Dead Redemption 2', 'Rockstar Games', 'Rockstar Games', '2019-10-26', 'Action Adventure', 'An epic tale of outlaw life in 1899 America. One of the most detailed open worlds ever created.', ARRAY['open-world', 'story-rich', 'cpu-heavy'], false, true, true, false, 'https://imgur.com/wNcAUoN.jpg', true, 4),
  ('black-myth-wukong', 'Black Myth: Wukong', 'Game Science', 'Game Science', '2024-08-20', 'Action RPG', 'A visually stunning action RPG based on the classic Chinese novel Journey to the West.', ARRAY['action', 'ray-tracing', 'gpu-heavy', 'dlss', 'fsr'], true, true, true, false, 'https://imgur.com/yWszzjT.jpg', true, 2),
  ('assassins-creed-shadows', 'Assassin''s Creed Shadows', 'Ubisoft', 'Ubisoft', '2025-02-14', 'Action RPG', 'Explore feudal Japan as dual protagonists in the latest Assassin''s Creed.', ARRAY['open-world', 'action', 'ray-tracing', 'dlss', 'fsr'], true, true, true, false, 'https://imgur.com/U5VoiQL.jpg', true, 3),
  ('the-last-of-us-part-1', 'The Last of Us Part I', 'PlayStation Publishing LLC', 'Naughty Dog LLC', '2023-03-28', 'Action Adventure', 'A post-apocalyptic survival game following Joel and Ellie across a ravaged United States.', ARRAY['story-rich', 'action', 'dlss'], false, true, true, false, 'https://imgur.com/uztXPuq.jpg', true, 5),
  ('the-last-of-us-part-2', 'The Last of Us Part II Remastered', 'PlayStation Publishing LLC', 'Naughty Dog LLC', '2024-01-19', 'Action Adventure', 'The harrowing sequel following Ellie on a quest for justice. Remastered with enhanced visuals.', ARRAY['story-rich', 'action', 'dlss'], false, true, true, false, 'https://imgur.com/P6jf9he.jpg', true, 6),
  ('cyberpunk-2077', 'Cyberpunk 2077', 'CD PROJEKT RED', 'CD PROJEKT RED', '2020-12-10', 'Action RPG', 'An open-world action RPG set in Night City, a megalopolis obsessed with power, glamour and body modification.', ARRAY['open-world', 'ray-tracing', 'gpu-heavy', 'dlss', 'fsr'], true, true, true, false, 'https://imgur.com/VDUcpgp.jpg', false, NULL);


-- ============================================
-- GAME REQUIREMENTS
-- ============================================

-- Cyberpunk 2077
INSERT INTO game_requirements (game_id, tier, description, cpu_id, gpu_id, ram_gb, vram_gb, storage_gb, requires_ssd, resolution_width, resolution_height, target_fps, notes) VALUES
  (
    (SELECT id FROM games WHERE slug = 'cyberpunk-2077'), 'minimum', 'For 30fps at 1080p Low',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i5-10400f'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3060-12gb'),
    8, 6, 70, false, 1920, 1080, 30, 'Windows 10, DirectX 12'
  ),
  (
    (SELECT id FROM games WHERE slug = 'cyberpunk-2077'), 'recommended', 'For 60fps at 1080p High',
    (SELECT id FROM cpus WHERE slug = 'amd-ryzen-5-5600x'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3080'),
    16, 8, 70, true, 1920, 1080, 60, 'Windows 10/11, DirectX 12'
  ),
  (
    (SELECT id FROM games WHERE slug = 'cyberpunk-2077'), '1440p recommended', 'For 60fps at 1440p Ultra',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i7-13700k'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-4080'),
    16, 12, 70, true, 2560, 1440, 60, 'Windows 10/11, DirectX 12'
  );

-- Red Dead Redemption 2
INSERT INTO game_requirements (game_id, tier, description, cpu_id, gpu_id, ram_gb, vram_gb, storage_gb, requires_ssd, resolution_width, resolution_height, target_fps, notes) VALUES
  (
    (SELECT id FROM games WHERE slug = 'red-dead-redemption-2'), 'minimum', 'For 30fps at 1080p Low',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i5-10400f'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3060-12gb'),
    8, 4, 150, false, 1920, 1080, 30, 'Windows 10, DirectX 12'
  ),
  (
    (SELECT id FROM games WHERE slug = 'red-dead-redemption-2'), 'recommended', 'For 60fps at 1080p High',
    (SELECT id FROM cpus WHERE slug = 'amd-ryzen-5-5600x'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3080'),
    16, 8, 150, false, 1920, 1080, 60, 'Windows 10/11, DirectX 12'
  );

-- Black Myth: Wukong
INSERT INTO game_requirements (game_id, tier, description, cpu_id, gpu_id, ram_gb, vram_gb, storage_gb, requires_ssd, resolution_width, resolution_height, target_fps, notes) VALUES
  (
    (SELECT id FROM games WHERE slug = 'black-myth-wukong'), 'minimum', 'For 60fps at 1080p Medium (no RT)',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i7-13700k'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3060-12gb'),
    16, 8, 130, true, 1920, 1080, 60, 'Windows 10/11, DirectX 12. Notoriously demanding.'
  ),
  (
    (SELECT id FROM games WHERE slug = 'black-myth-wukong'), 'recommended', 'For 60fps at 1440p High',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i7-13700k'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-4080'),
    16, 16, 130, true, 2560, 1440, 60, 'Windows 10/11, DirectX 12'
  );

-- Assassin''s Creed Shadows
INSERT INTO game_requirements (game_id, tier, description, cpu_id, gpu_id, ram_gb, vram_gb, storage_gb, requires_ssd, resolution_width, resolution_height, target_fps, notes) VALUES
  (
    (SELECT id FROM games WHERE slug = 'assassins-creed-shadows'), 'minimum', 'For 30fps at 1080p Low',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i5-12400f'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3060-12gb'),
    16, 8, 65, true, 1920, 1080, 30, 'Windows 10/11, DirectX 12, SSD required'
  ),
  (
    (SELECT id FROM games WHERE slug = 'assassins-creed-shadows'), 'recommended', 'For 60fps at 1080p High',
    (SELECT id FROM cpus WHERE slug = 'amd-ryzen-7-7800x3d'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-4080'),
    16, 16, 65, true, 1920, 1080, 60, 'Windows 10/11, DirectX 12, SSD required'
  );

-- Kingdom Come: Deliverance 2
INSERT INTO game_requirements (game_id, tier, description, cpu_id, gpu_id, ram_gb, vram_gb, storage_gb, requires_ssd, resolution_width, resolution_height, target_fps, notes) VALUES
  (
    (SELECT id FROM games WHERE slug = 'kingdom-come-deliverance-2'), 'minimum', 'For 30fps at 1080p Low',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i5-12400f'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3060-12gb'),
    12, 8, 100, true, 1920, 1080, 30, 'Windows 10/11, DirectX 12, SSD required'
  ),
  (
    (SELECT id FROM games WHERE slug = 'kingdom-come-deliverance-2'), 'recommended', 'For 60fps at 1440p High',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i7-13700k'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-4080'),
    16, 16, 100, true, 2560, 1440, 60, 'Windows 10/11, DirectX 12, SSD required'
  );

-- The Last of Us Part I
INSERT INTO game_requirements (game_id, tier, description, cpu_id, gpu_id, ram_gb, vram_gb, storage_gb, requires_ssd, resolution_width, resolution_height, target_fps, notes) VALUES
  (
    (SELECT id FROM games WHERE slug = 'the-last-of-us-part-1'), 'minimum', 'For 30fps at 1080p Low',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i5-10400f'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3060-12gb'),
    16, 8, 100, false, 1920, 1080, 30, 'Windows 10/11, DirectX 12'
  ),
  (
    (SELECT id FROM games WHERE slug = 'the-last-of-us-part-1'), 'recommended', 'For 60fps at 1080p High',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i5-13600k'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3080'),
    16, 10, 100, false, 1920, 1080, 60, 'Windows 10/11, DirectX 12'
  );

-- The Last of Us Part II Remastered
INSERT INTO game_requirements (game_id, tier, description, cpu_id, gpu_id, ram_gb, vram_gb, storage_gb, requires_ssd, resolution_width, resolution_height, target_fps, notes) VALUES
  (
    (SELECT id FROM games WHERE slug = 'the-last-of-us-part-2'), 'minimum', 'For 30fps at 1080p Low',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i5-12400f'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3060-12gb'),
    16, 8, 100, false, 1920, 1080, 30, 'Windows 10/11, DirectX 12'
  ),
  (
    (SELECT id FROM games WHERE slug = 'the-last-of-us-part-2'), 'recommended', 'For 60fps at 1080p High',
    (SELECT id FROM cpus WHERE slug = 'intel-core-i7-13700k'), (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3080'),
    16, 10, 100, false, 1920, 1080, 60, 'Windows 10/11, DirectX 12'
  );


-- ============================================
-- PERFORMANCE RECORDS (~30 records at 1080p)
-- Sources: Digital Foundry, TechPowerUp, hardware.fr
-- ============================================

INSERT INTO performance_records (game_id, gpu_id, cpu_id, ram_gb, res_width, res_height, settings, upscaler, fps_avg, fps_1_percent_low, verified, source, source_url) VALUES

  -- Cyberpunk 2077
  ((SELECT id FROM games WHERE slug='cyberpunk-2077'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3060-12gb'), (SELECT id FROM cpus WHERE slug='amd-ryzen-5-5600x'), 16, 1920, 1080, 'low', 'off', 62, 48, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='cyberpunk-2077'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3060-12gb'), (SELECT id FROM cpus WHERE slug='amd-ryzen-5-5600x'), 16, 1920, 1080, 'high', 'off', 44, 33, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='cyberpunk-2077'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3080'), (SELECT id FROM cpus WHERE slug='intel-core-i7-13700k'), 32, 1920, 1080, 'ultra', 'off', 95, 72, true, 'measured', 'https://www.digitalfoundry.net'),
  ((SELECT id FROM games WHERE slug='cyberpunk-2077'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4080'), (SELECT id FROM cpus WHERE slug='intel-core-i7-13700k'), 32, 1920, 1080, 'ultra', 'off', 135, 105, true, 'measured', 'https://www.digitalfoundry.net'),
  ((SELECT id FROM games WHERE slug='cyberpunk-2077'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4090'), (SELECT id FROM cpus WHERE slug='amd-ryzen-7-7800x3d'), 32, 1920, 1080, 'ultra', 'off', 180, 145, true, 'measured', 'https://www.digitalfoundry.net'),
  ((SELECT id FROM games WHERE slug='cyberpunk-2077'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3070'), (SELECT id FROM cpus WHERE slug='amd-ryzen-5-5600x'), 16, 1920, 1080, 'high', 'off', 68, 52, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='cyberpunk-2077'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4070'), (SELECT id FROM cpus WHERE slug='intel-core-i5-12400f'), 16, 1920, 1080, 'ultra', 'off', 88, 67, true, 'measured', 'https://www.techpowerup.com'),

  -- Red Dead Redemption 2
  ((SELECT id FROM games WHERE slug='red-dead-redemption-2'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3060-12gb'), (SELECT id FROM cpus WHERE slug='amd-ryzen-5-5600x'), 16, 1920, 1080, 'medium', 'off', 72, 55, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='red-dead-redemption-2'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3080'), (SELECT id FROM cpus WHERE slug='intel-core-i7-13700k'), 32, 1920, 1080, 'ultra', 'off', 98, 75, true, 'measured', 'https://www.digitalfoundry.net'),
  ((SELECT id FROM games WHERE slug='red-dead-redemption-2'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4070'), (SELECT id FROM cpus WHERE slug='intel-core-i5-12400f'), 16, 1920, 1080, 'high', 'off', 82, 63, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='red-dead-redemption-2'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4090'), (SELECT id FROM cpus WHERE slug='amd-ryzen-7-7800x3d'), 32, 1920, 1080, 'ultra', 'off', 155, 120, true, 'measured', 'https://www.digitalfoundry.net'),

  -- Black Myth: Wukong
  ((SELECT id FROM games WHERE slug='black-myth-wukong'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3060-12gb'), (SELECT id FROM cpus WHERE slug='intel-core-i5-12400f'), 16, 1920, 1080, 'medium', 'off', 42, 31, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='black-myth-wukong'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3080'), (SELECT id FROM cpus WHERE slug='intel-core-i7-13700k'), 32, 1920, 1080, 'high', 'off', 68, 51, true, 'measured', 'https://www.digitalfoundry.net'),
  ((SELECT id FROM games WHERE slug='black-myth-wukong'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4080'), (SELECT id FROM cpus WHERE slug='intel-core-i7-13700k'), 32, 1920, 1080, 'ultra', 'off', 85, 64, true, 'measured', 'https://www.digitalfoundry.net'),
  ((SELECT id FROM games WHERE slug='black-myth-wukong'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4090'), (SELECT id FROM cpus WHERE slug='amd-ryzen-7-7800x3d'), 32, 1920, 1080, 'ultra', 'off', 105, 82, true, 'measured', 'https://www.digitalfoundry.net'),

  -- Assassin''s Creed Shadows
  ((SELECT id FROM games WHERE slug='assassins-creed-shadows'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3060-12gb'), (SELECT id FROM cpus WHERE slug='intel-core-i5-12400f'), 16, 1920, 1080, 'medium', 'off', 48, 36, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='assassins-creed-shadows'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3080'), (SELECT id FROM cpus WHERE slug='amd-ryzen-7-7800x3d'), 16, 1920, 1080, 'high', 'off', 72, 55, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='assassins-creed-shadows'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4080'), (SELECT id FROM cpus WHERE slug='amd-ryzen-7-7800x3d'), 32, 1920, 1080, 'ultra', 'off', 98, 75, true, 'measured', 'https://www.digitalfoundry.net'),
  ((SELECT id FROM games WHERE slug='assassins-creed-shadows'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4090'), (SELECT id FROM cpus WHERE slug='amd-ryzen-9-7950x3d'), 32, 1920, 1080, 'ultra', 'off', 128, 100, true, 'measured', 'https://www.digitalfoundry.net'),

  -- The Last of Us Part I
  ((SELECT id FROM games WHERE slug='the-last-of-us-part-1'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3060-12gb'), (SELECT id FROM cpus WHERE slug='amd-ryzen-5-5600x'), 16, 1920, 1080, 'medium', 'off', 65, 50, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='the-last-of-us-part-1'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3080'), (SELECT id FROM cpus WHERE slug='intel-core-i5-13600k'), 16, 1920, 1080, 'high', 'off', 95, 74, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='the-last-of-us-part-1'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4070'), (SELECT id FROM cpus WHERE slug='intel-core-i5-13600k'), 16, 1920, 1080, 'ultra', 'off', 88, 68, true, 'measured', 'https://www.techpowerup.com'),

  -- Kingdom Come: Deliverance 2
  ((SELECT id FROM games WHERE slug='kingdom-come-deliverance-2'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3060-12gb'), (SELECT id FROM cpus WHERE slug='intel-core-i5-12400f'), 16, 1920, 1080, 'medium', 'off', 44, 33, true, 'measured', 'https://www.techpowerup.com'),
  ((SELECT id FROM games WHERE slug='kingdom-come-deliverance-2'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-3080'), (SELECT id FROM cpus WHERE slug='intel-core-i7-13700k'), 32, 1920, 1080, 'high', 'off', 65, 49, true, 'measured', 'https://www.digitalfoundry.net'),
  ((SELECT id FROM games WHERE slug='kingdom-come-deliverance-2'), (SELECT id FROM gpus WHERE slug='nvidia-rtx-4080'), (SELECT id FROM cpus WHERE slug='amd-ryzen-7-7800x3d'), 32, 1920, 1080, 'ultra', 'off', 88, 68, true, 'measured', 'https://www.digitalfoundry.net');
