-- ==========================================
-- Require refusal reason for rejected merchants
-- Date: 2026-02-27
-- ==========================================

BEGIN;

-- Backfill existing refused merchants without a reason
UPDATE public.merchants
SET refusal_reason = COALESCE(NULLIF(btrim(refusal_reason), ''), 'Motif non précisé par administrateur'),
    updated_at = now()
WHERE COALESCE(is_refused, false) = true
  AND (refusal_reason IS NULL OR btrim(refusal_reason) = '');

ALTER TABLE public.merchants
  DROP CONSTRAINT IF EXISTS merchants_refusal_reason_required;

ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_refusal_reason_required
  CHECK (
    COALESCE(is_refused, false) = false
    OR (refusal_reason IS NOT NULL AND btrim(refusal_reason) <> '')
  );

COMMIT;
