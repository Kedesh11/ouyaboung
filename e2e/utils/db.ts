// ============================================
// E2E DB helper - service_role Supabase client for arranging/asserting
// state directly (pending applications, order status, etc.) that would be
// slow or redundant to drive purely through the UI in every spec, on top
// of the local Supabase stack only (see e2e/global-setup.ts).
// ============================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

/**
 * Confirms a freshly signed-up user's email via the admin API instead of
 * reading a real confirmation email. This project's Supabase config routes
 * auth emails through real SMTP even for local dev
 * (supabase/config.toml `[auth.email.smtp] enabled = true`), so the local
 * mail catcher (Mailpit) never receives anything to read - going through
 * the admin API is the standard, SMTP-independent way to test the
 * signup -> confirmation -> login path end to end regardless of environment.
 */
export async function confirmUserEmail(email: string) {
  const { data, error } = await adminDb.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`confirmUserEmail lookup failed: ${error.message}`);
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`confirmUserEmail: no user found for ${email}`);

  const { error: updateError } = await adminDb.auth.admin.updateUserById(user.id, { email_confirm: true });
  if (updateError) throw new Error(`confirmUserEmail update failed: ${updateError.message}`);
}

export async function createPendingMerchant(businessName: string) {
  const email = `e2e-pending-merchant-${unique()}@ouyaboung.test`;
  const { data, error } = await adminDb
    .from('merchants')
    .insert({
      user_id: null,
      business_name: businessName,
      business_type: 'grocery',
      email,
      phone: '+24101020399',
      address: '1 rue de test',
      city: 'Libreville',
      quartier: 'Louis',
      is_verified: false,
      is_active: false,
      is_refused: false,
    })
    .select('id, email')
    .single();
  if (error) throw new Error(`createPendingMerchant failed: ${error.message}`);
  return data;
}

export async function createPendingFarmer(farmName: string) {
  const email = `e2e-pending-farmer-${unique()}@ouyaboung.test`;
  const { data, error } = await adminDb
    .from('farmers')
    .insert({
      user_id: null,
      farm_name: farmName,
      farmer_type: 'agriculture',
      email,
      phone: '+24101020398',
      address: '2 route de test',
      city: 'Libreville',
      quartier: 'Nzeng-Ayong',
      is_verified: false,
      is_active: false,
      is_refused: false,
    })
    .select('id, email')
    .single();
  if (error) throw new Error(`createPendingFarmer failed: ${error.message}`);
  return data;
}

export async function createPendingDriver(fullName: string) {
  const email = `e2e-pending-driver-${unique()}@ouyaboung.test`;
  const { data, error } = await adminDb
    .from('drivers')
    .insert({
      user_id: null,
      full_name: fullName,
      vehicle_type: 'moto',
      email,
      phone: '+24101020397',
      city: 'Libreville',
      is_verified: false,
      is_active: false,
      is_refused: false,
    })
    .select('id, email')
    .single();
  if (error) throw new Error(`createPendingDriver failed: ${error.message}`);
  return data;
}

export async function getFarmerIdByEmail(email: string) {
  const { data, error } = await adminDb.from('farmers').select('id').eq('email', email).single();
  if (error) throw new Error(`getFarmerIdByEmail failed: ${error.message}`);
  return data.id as string;
}

export async function getMerchantIdByEmail(email: string) {
  const { data, error } = await adminDb.from('merchants').select('id').eq('email', email).single();
  if (error) throw new Error(`getMerchantIdByEmail failed: ${error.message}`);
  return data.id as string;
}

export async function getFarmOrderStatus(farmOrderId: string) {
  const { data, error } = await adminDb.from('farm_orders').select('status').eq('id', farmOrderId).single();
  if (error) throw new Error(`getFarmOrderStatus failed: ${error.message}`);
  return data.status as string;
}

/**
 * Arranges a farm_order already at status 'ready' (with its matching
 * `deliveries` row created by the trigger_create_delivery_on_farm_order_ready
 * trigger) between the fixture farmer/merchant, independent of
 * b2b-marketplace.spec.ts - so delivery-cycle.spec.ts can run standalone.
 * Inserts as 'pending' first and then updates to 'ready' because the
 * delivery-creation trigger only fires on UPDATE OF status, not INSERT.
 */
export async function createReadyFarmOrder(farmerEmail: string, merchantEmail: string) {
  const farmerId = await getFarmerIdByEmail(farmerEmail);
  const merchantId = await getMerchantIdByEmail(merchantEmail);
  const productName = `E2E Delivery Product ${unique()}`;

  const { data: product, error: productError } = await adminDb
    .from('farm_products')
    .insert({
      farmer_id: farmerId,
      name: productName,
      category: 'tubercules',
      unit: 'kg',
      price_per_unit: 1200,
      quantity_available: 100,
      is_available: true,
    })
    .select('id, unit, price_per_unit')
    .single();
  if (productError || !product) throw new Error(`createReadyFarmOrder product failed: ${productError?.message}`);

  const { data: order, error: orderError } = await adminDb
    .from('farm_orders')
    .insert({
      merchant_id: merchantId,
      farmer_id: farmerId,
      farm_product_id: product.id,
      quantity: 10,
      unit: product.unit,
      price_per_unit: product.price_per_unit,
      total_price: product.price_per_unit * 10,
      status: 'pending',
    })
    .select('id')
    .single();
  if (orderError || !order) throw new Error(`createReadyFarmOrder insert failed: ${orderError?.message}`);

  const { error: updateError } = await adminDb
    .from('farm_orders')
    .update({ status: 'confirmed' })
    .eq('id', order.id);
  if (updateError) throw new Error(`createReadyFarmOrder confirm failed: ${updateError.message}`);

  const { error: readyError } = await adminDb
    .from('farm_orders')
    .update({ status: 'ready' })
    .eq('id', order.id);
  if (readyError) throw new Error(`createReadyFarmOrder ready failed: ${readyError.message}`);

  const { data: delivery, error: deliveryError } = await adminDb
    .from('deliveries')
    .select('id, status')
    .eq('farm_order_id', order.id)
    .single();
  if (deliveryError || !delivery) throw new Error(`createReadyFarmOrder delivery lookup failed: ${deliveryError?.message}`);

  return { farmOrderId: order.id as string, deliveryId: delivery.id as string, productName };
}
