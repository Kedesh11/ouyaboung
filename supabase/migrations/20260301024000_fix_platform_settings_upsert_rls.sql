-- Fix RLS for platform_settings upserts from authenticated admin clients.
-- Supabase upsert requires INSERT policy even when ON CONFLICT updates an existing row.

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can insert platform settings" ON public.platform_settings;
CREATE POLICY "Admins can insert platform settings"
  ON public.platform_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Ensure required keys exist for admin dashboard settings editor.
INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('general', '{"platformName": "ouyaboung Gabon", "supportEmail": "support@ouyaboung.ga"}', 'General platform information'),
  ('registration', '{"isOpen": true, "autoApprove": false}', 'Merchant registration settings'),
  ('maintenance', '{"isEnabled": false, "message": "Plateforme en maintenance"}', 'Maintenance mode configuration')
ON CONFLICT (key) DO NOTHING;
