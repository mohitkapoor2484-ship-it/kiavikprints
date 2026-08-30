ALTER TABLE kp_products
  ADD COLUMN IF NOT EXISTS color_mode TEXT NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS color_slot_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS text_color_options JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE kp_products
SET
  color_mode = CASE WHEN COALESCE(color_slot_count, 1) > 1 THEN 'multi' ELSE 'single' END,
  color_slot_count = GREATEST(1, LEAST(4, COALESCE(color_slot_count, 1)))
WHERE color_mode NOT IN ('single', 'multi')
   OR color_mode IS NULL
   OR color_slot_count IS NULL
   OR color_slot_count < 1
   OR color_slot_count > 4;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kp_products_color_mode_check'
  ) THEN
    ALTER TABLE kp_products
      ADD CONSTRAINT kp_products_color_mode_check
      CHECK (color_mode IN ('single', 'multi'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kp_products_color_slot_count_check'
  ) THEN
    ALTER TABLE kp_products
      ADD CONSTRAINT kp_products_color_slot_count_check
      CHECK (color_slot_count BETWEEN 1 AND 4);
  END IF;
END $$;

ALTER TABLE kp_order_items
  ADD COLUMN IF NOT EXISTS color_choices JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS text_color_choice TEXT NOT NULL DEFAULT '';
