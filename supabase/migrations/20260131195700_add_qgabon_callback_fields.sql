-- Migration: Add Missing Q-Gabon Callback Parameters
-- Description: Store all Q-Gabon callback parameters for complete audit trail

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS fees DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS customer_id TEXT,
  ADD COLUMN IF NOT EXISTS operator_owner_charge TEXT;

-- Comments for clarity
COMMENT ON COLUMN transactions.amount IS 'Base amount without fees (from Q-Gabon)';
COMMENT ON COLUMN transactions.total_amount IS 'Total amount including fees (from Q-Gabon)';
COMMENT ON COLUMN transactions.fees IS 'Total fees charged (from Q-Gabon)';
COMMENT ON COLUMN transactions.customer_id IS 'Customer phone number (from Q-Gabon)';
COMMENT ON COLUMN transactions.operator_owner_charge IS 'Who pays operator fees (from Q-Gabon)';
