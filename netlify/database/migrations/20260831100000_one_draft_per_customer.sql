-- Merge any legacy drafts before preventing multiple active drafts for one customer.
WITH ranked AS (
  SELECT id, user_id,
    FIRST_VALUE(id) OVER (PARTITION BY user_id ORDER BY updated_at DESC, created_at DESC, id DESC) AS keep_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC, created_at DESC, id DESC) AS position
  FROM kp_orders
  WHERE payment_status = 'draft' AND user_id IS NOT NULL
)
UPDATE kp_order_items AS item
SET order_id = ranked.keep_id
FROM ranked
WHERE item.order_id = ranked.id AND ranked.position > 1;

WITH ranked AS (
  SELECT id, user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC, created_at DESC, id DESC) AS position
  FROM kp_orders
  WHERE payment_status = 'draft' AND user_id IS NOT NULL
)
DELETE FROM kp_orders AS orders
USING ranked
WHERE orders.id = ranked.id AND ranked.position > 1;

UPDATE kp_orders AS orders
SET subtotal_cents = COALESCE((SELECT SUM(line_total_cents) FROM kp_order_items WHERE order_id = orders.id), 0),
    total_cents = COALESCE((SELECT SUM(line_total_cents) FROM kp_order_items WHERE order_id = orders.id), 0) + shipping_cents,
    updated_at = NOW()
WHERE payment_status = 'draft' AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kp_orders_one_draft_per_user_idx
  ON kp_orders(user_id)
  WHERE payment_status = 'draft' AND user_id IS NOT NULL;
