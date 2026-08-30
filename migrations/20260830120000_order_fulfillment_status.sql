ALTER TABLE kp_orders
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'received';

UPDATE kp_orders
SET fulfillment_status = CASE
  WHEN payment_status = 'draft' THEN 'draft'
  WHEN payment_status = 'pending' THEN 'awaiting_payment'
  ELSE 'received'
END
WHERE payment_status IN ('draft', 'pending');
