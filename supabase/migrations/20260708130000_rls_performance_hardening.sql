-- ============================================
-- RLS performance hardening (auth_rls_initplan)
-- Date: 2026-07-08
--
-- Wraps every auth.uid() call in RLS policies as (select auth.uid())
-- so Postgres evaluates it once per statement (InitPlan) instead of
-- potentially once per row - the auth_rls_initplan lint from Supabase's
-- own Performance Advisor. Also consolidates the three near-duplicate
-- admin-check functions (is_admin(uuid), is_admin(), current_user_is_admin())
-- onto a single STABLE source of truth, and replaces inline
-- `exists(select 1 from profiles where role='admin')` policy conditions
-- with the is_admin() helper. No policy's logical condition changes -
-- this migration is purely a performance rewrite.
-- ============================================

BEGIN;

-- 1) Canonical, STABLE admin/merchant helper functions.
-- is_admin(uuid) stays the single source of truth (used with an explicit
-- uuid by most policies); is_admin() and current_user_is_admin() become
-- thin STABLE delegations kept only because existing policies reference
-- them by name/signature.

CREATE OR REPLACE FUNCTION public.is_admin(user_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = user_uuid AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin((select auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin((select auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.is_merchant(user_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = user_uuid AND role = 'merchant'
  );
$$;

-- 2) Rewrite every policy that references auth.uid() so it is wrapped,
--    and fold bare admin-role exists() checks into is_admin().

DROP POLICY IF EXISTS "Admins can insert admin activities" ON public.admin_activities;
CREATE POLICY "Admins can insert admin activities"
  ON public.admin_activities FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can view admin activities" ON public.admin_activities;
CREATE POLICY "Admins can view admin activities"
  ON public.admin_activities FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can manage admin payout accounts" ON public.admin_payout_accounts;
CREATE POLICY "Admins can manage admin payout accounts"
  ON public.admin_payout_accounts FOR ALL
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can view own audit logs" ON public.auth_audit_log;
CREATE POLICY "Users can view own audit logs"
  ON public.auth_audit_log FOR SELECT
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can create own MFA factors" ON public.auth_mfa_factors;
CREATE POLICY "Users can create own MFA factors"
  ON public.auth_mfa_factors FOR INSERT
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete own MFA factors" ON public.auth_mfa_factors;
CREATE POLICY "Users can delete own MFA factors"
  ON public.auth_mfa_factors FOR DELETE
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update own MFA factors" ON public.auth_mfa_factors;
CREATE POLICY "Users can update own MFA factors"
  ON public.auth_mfa_factors FOR UPDATE
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can view own MFA factors" ON public.auth_mfa_factors;
CREATE POLICY "Users can view own MFA factors"
  ON public.auth_mfa_factors FOR SELECT
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can create own sessions" ON public.auth_sessions;
CREATE POLICY "Users can create own sessions"
  ON public.auth_sessions FOR INSERT
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.auth_sessions;
CREATE POLICY "Users can delete own sessions"
  ON public.auth_sessions FOR DELETE
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update own sessions" ON public.auth_sessions;
CREATE POLICY "Users can update own sessions"
  ON public.auth_sessions FOR UPDATE
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can view own sessions" ON public.auth_sessions;
CREATE POLICY "Users can view own sessions"
  ON public.auth_sessions FOR SELECT
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can create contact messages" ON public.contact_messages;
CREATE POLICY "Users can create contact messages"
  ON public.contact_messages FOR INSERT
  WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own messages" ON public.contact_messages;
CREATE POLICY "Users can view their own messages"
  ON public.contact_messages FOR SELECT
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own favorites" ON public.favorites;
CREATE POLICY "Users can manage own favorites"
  ON public.favorites FOR ALL
  USING (((select auth.uid()) = user_id))
  WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorites;
CREATE POLICY "Users can view own favorites"
  ON public.favorites FOR SELECT
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Merchants can manage own food items" ON public.food_items;
CREATE POLICY "Merchants can manage own food items"
  ON public.food_items FOR ALL
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (merchants m
     JOIN profiles p ON ((p.user_id = m.user_id)))
  WHERE ((m.id = food_items.merchant_id) AND (m.user_id = (select auth.uid())) AND (p.role = 'merchant'::text) AND (m.is_verified = true) AND (m.is_active = true) AND (COALESCE(m.is_refused, false) = false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (merchants m
     JOIN profiles p ON ((p.user_id = m.user_id)))
  WHERE ((m.id = food_items.merchant_id) AND (m.user_id = (select auth.uid())) AND (p.role = 'merchant'::text) AND (m.is_verified = true) AND (m.is_active = true) AND (COALESCE(m.is_refused, false) = false)))));

DROP POLICY IF EXISTS "Users can view food items from own orders" ON public.food_items;
CREATE POLICY "Users can view food items from own orders"
  ON public.food_items FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.food_item_id = food_items.id) AND (o.user_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "Users can view own impact logs" ON public.impact_logs;
CREATE POLICY "Users can view own impact logs"
  ON public.impact_logs FOR SELECT
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Admins can manage merchant payout accounts" ON public.merchant_payout_accounts;
CREATE POLICY "Admins can manage merchant payout accounts"
  ON public.merchant_payout_accounts FOR ALL
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Merchants can propose own payout accounts" ON public.merchant_payout_accounts;
CREATE POLICY "Merchants can propose own payout accounts"
  ON public.merchant_payout_accounts FOR INSERT
  WITH CHECK (((EXISTS ( SELECT 1
   FROM merchants m
  WHERE ((m.id = merchant_payout_accounts.merchant_id) AND (m.user_id = (select auth.uid()))))) AND (verification_status = 'pending'::text) AND (disbursement_id IS NULL)));

DROP POLICY IF EXISTS "Merchants can read own payout accounts" ON public.merchant_payout_accounts;
CREATE POLICY "Merchants can read own payout accounts"
  ON public.merchant_payout_accounts FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM merchants m
  WHERE ((m.id = merchant_payout_accounts.merchant_id) AND (m.user_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "Admins can manage all merchants" ON public.merchants;
CREATE POLICY "Admins can manage all merchants"
  ON public.merchants FOR ALL
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Merchants can manage own profile" ON public.merchants;
CREATE POLICY "Merchants can manage own profile"
  ON public.merchants FOR ALL
  TO authenticated
  USING ((is_merchant((select auth.uid())) AND (user_id = (select auth.uid()))));

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Merchants can update their orders" ON public.orders;
CREATE POLICY "Merchants can update their orders"
  ON public.orders FOR UPDATE
  USING ((EXISTS ( SELECT 1
   FROM (merchants m
     JOIN profiles p ON ((m.user_id = p.user_id)))
  WHERE ((m.id = orders.merchant_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'merchant'::text)))));

DROP POLICY IF EXISTS "Merchants can view their orders" ON public.orders;
CREATE POLICY "Merchants can view their orders"
  ON public.orders FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM (merchants m
     JOIN profiles p ON ((m.user_id = p.user_id)))
  WHERE ((m.id = orders.merchant_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'merchant'::text)))));

DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
CREATE POLICY "Users can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders"
  ON public.orders FOR SELECT
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "users_update_own_orders_v2" ON public.orders;
CREATE POLICY "users_update_own_orders_v2"
  ON public.orders FOR UPDATE
  USING ((((select auth.uid()) = user_id) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text]))));

DROP POLICY IF EXISTS "Users can update own reset tokens" ON public.password_reset_tokens;
CREATE POLICY "Users can update own reset tokens"
  ON public.password_reset_tokens FOR UPDATE
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can view own reset tokens" ON public.password_reset_tokens;
CREATE POLICY "Users can view own reset tokens"
  ON public.password_reset_tokens FOR SELECT
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Admins can read all payment settlements" ON public.payment_settlements;
CREATE POLICY "Admins can read all payment settlements"
  ON public.payment_settlements FOR SELECT
  USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Merchants can read own payment settlements" ON public.payment_settlements;
CREATE POLICY "Merchants can read own payment settlements"
  ON public.payment_settlements FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM merchants m
  WHERE ((m.id = payment_settlements.merchant_id) AND (m.user_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "Users can read own payment settlements" ON public.payment_settlements;
CREATE POLICY "Users can read own payment settlements"
  ON public.payment_settlements FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM payment_transactions pt
  WHERE ((pt.id = payment_settlements.payment_transaction_id) AND (pt.user_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "Admins can read all payment transactions" ON public.payment_transactions;
CREATE POLICY "Admins can read all payment transactions"
  ON public.payment_transactions FOR SELECT
  USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Merchants can read own payment transactions" ON public.payment_transactions;
CREATE POLICY "Merchants can read own payment transactions"
  ON public.payment_transactions FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM merchants m
  WHERE ((m.id = payment_transactions.merchant_id) AND (m.user_id = (select auth.uid()))))));

DROP POLICY IF EXISTS "Users can read own payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can read own payment transactions"
  ON public.payment_transactions FOR SELECT
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Admins can manage platform wallets" ON public.platform_payment_wallets;
CREATE POLICY "Admins can manage platform wallets"
  ON public.platform_payment_wallets FOR ALL
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can insert platform settings" ON public.platform_settings;
CREATE POLICY "Admins can insert platform settings"
  ON public.platform_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can update platform settings" ON public.platform_settings;
CREATE POLICY "Admins can update platform settings"
  ON public.platform_settings FOR UPDATE
  TO authenticated
  USING (is_admin((select auth.uid())))
  WITH CHECK (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can view platform settings" ON public.platform_settings;
CREATE POLICY "Admins can view platform settings"
  ON public.platform_settings FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;
CREATE POLICY "Users can create reviews"
  ON public.reviews FOR INSERT
  WITH CHECK ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM orders
  WHERE ((orders.id = reviews.order_id) AND (orders.user_id = (select auth.uid())) AND (orders.status = 'completed'::text))))));

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions"
  ON public.transactions FOR SELECT
  USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Merchants can view their transactions" ON public.transactions;
CREATE POLICY "Merchants can view their transactions"
  ON public.transactions FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM (merchants m
     JOIN profiles p ON ((m.user_id = p.user_id)))
  WHERE ((m.id = transactions.merchant_id) AND (p.user_id = (select auth.uid())) AND (p.role = 'merchant'::text)))));

DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = transactions.order_id) AND (o.user_id = (select auth.uid())) AND (o.merchant_id = transactions.merchant_id))))));

DROP POLICY IF EXISTS "Users can update own pending transactions" ON public.transactions;
CREATE POLICY "Users can update own pending transactions"
  ON public.transactions FOR UPDATE
  TO authenticated
  USING ((((select auth.uid()) = user_id) AND (status = 'PENDING'::text)))
  WITH CHECK ((((select auth.uid()) = user_id) AND (status = ANY (ARRAY['PENDING'::text, 'FAILED'::text]))));

DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.webhook_logs;
CREATE POLICY "Admins can view webhook logs"
  ON public.webhook_logs FOR SELECT
  TO authenticated
  USING (is_admin((select auth.uid())));

-- 3) Missing composite index for merchant-scoped inventory queries
--    (src/api/inventory.api.ts filters merchant_id + is_available together;
--    the existing partial index for public search does not lead with merchant_id).
CREATE INDEX IF NOT EXISTS idx_food_items_merchant_available
  ON public.food_items (merchant_id, is_available, quantity_available);

COMMIT;