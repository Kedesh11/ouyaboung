-- Migration: Add QR Code Validation Fields
-- Description: Adds fields for secure QR code generation and merchant validation

-- Add columns to orders table
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS pickup_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumed_by UUID REFERENCES profiles(id);

-- Create index for fast lookup during scan
CREATE INDEX IF NOT EXISTS idx_orders_pickup_code ON orders(pickup_code);

-- Comment for clarity
COMMENT ON COLUMN orders.pickup_code IS 'Unique code displayed in QR for merchant validation';
COMMENT ON COLUMN orders.consumed_at IS 'Timestamp when QR code was scanned by merchant';
COMMENT ON COLUMN orders.consumed_by IS 'Merchant who validated the QR code';
