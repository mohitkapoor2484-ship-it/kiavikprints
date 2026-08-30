ALTER TABLE kp_products
  ADD COLUMN IF NOT EXISTS extra_clicker_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (extra_clicker_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS extra_text_clicker_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (extra_text_clicker_price_cents >= 0);
