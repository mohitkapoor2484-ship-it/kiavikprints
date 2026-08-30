ALTER TABLE kp_products
  ADD COLUMN IF NOT EXISTS base_color_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS button_color_options JSONB NOT NULL DEFAULT '[]'::jsonb;
