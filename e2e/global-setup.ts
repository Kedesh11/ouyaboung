// ============================================
// E2E Global Setup - Seeds pre-approved test accounts
// ============================================
// Runs once before the whole Playwright suite. Talks directly to the local
// Supabase stack (`supabase start`) with the service_role key, so it can
// bypass RLS and doesn't depend on any auth trigger behaving a particular
// way - the triggers themselves are only exercised by the real UI flows in
// auth.spec.ts / *-onboarding.spec.ts, never by this setup script.

import { createClient } from '@supabase/supabase-js';
import { TEST_USERS } from './fixtures/test-users';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
// Fixed local Supabase CLI demo service_role key (same for every local
// project, printed by `supabase start`) - never a production secret.
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email: string) {
  // Admin API has no direct getUserByEmail; the fixture set is tiny (5
  // accounts) so a single page listing is enough.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

async function ensureAuthUser(email: string, password: string, role: string, metadata?: Record<string, unknown>) {
  const existing = await findUserByEmail(email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, ...metadata },
  });
  if (error) throw new Error(`Failed to create fixture user ${email}: ${error.message}`);
  return data.user;
}

async function ensureProfile(userId: string, email: string, role: string, fullName: string) {
  const { error } = await admin
    .from('profiles')
    .upsert(
      { user_id: userId, email, role, full_name: fullName },
      { onConflict: 'user_id' }
    );
  if (error) throw new Error(`Failed to upsert profile for ${email}: ${error.message}`);
}

async function ensureApprovedMerchant(userId: string, email: string, metadata: Record<string, any>) {
  const { data: existing } = await admin.from('merchants').select('id').eq('user_id', userId).maybeSingle();
  const payload = {
    user_id: userId,
    business_name: metadata.business_name,
    business_type: metadata.business_type,
    phone: metadata.phone,
    email,
    address: metadata.address,
    city: metadata.city,
    quartier: metadata.quartier,
    is_verified: true,
    is_active: true,
    is_refused: false,
    validated_at: new Date().toISOString(),
  };
  if (existing) {
    await admin.from('merchants').update(payload).eq('id', existing.id);
  } else {
    await admin.from('merchants').insert(payload);
  }
}

async function ensureApprovedFarmer(userId: string, email: string, metadata: Record<string, any>) {
  const { data: existing } = await admin.from('farmers').select('id').eq('user_id', userId).maybeSingle();
  const payload = {
    user_id: userId,
    farm_name: metadata.farm_name,
    farmer_type: metadata.farmer_type,
    phone: metadata.phone,
    email,
    address: metadata.address,
    city: metadata.city,
    quartier: metadata.quartier,
    is_verified: true,
    is_active: true,
    is_refused: false,
    validated_at: new Date().toISOString(),
  };
  if (existing) {
    await admin.from('farmers').update(payload).eq('id', existing.id);
  } else {
    await admin.from('farmers').insert(payload);
  }
}

async function ensureApprovedDriver(userId: string, email: string, metadata: Record<string, any>) {
  const { data: existing } = await admin.from('drivers').select('id').eq('user_id', userId).maybeSingle();
  const payload = {
    user_id: userId,
    full_name: metadata.full_name,
    vehicle_type: metadata.vehicle_type,
    phone: metadata.phone,
    email,
    city: metadata.city,
    delivery_zone: metadata.delivery_zone,
    is_verified: true,
    is_active: true,
    is_refused: false,
    validated_at: new Date().toISOString(),
  };
  if (existing) {
    await admin.from('drivers').update(payload).eq('id', existing.id);
  } else {
    await admin.from('drivers').insert(payload);
  }
}

export const RESERVATION_FIXTURE_SLUG = 'e2e-reservation-item';

async function ensureReservationFoodItem(merchantUserId: string) {
  const { data: merchant, error: merchantError } = await admin
    .from('merchants')
    .select('id')
    .eq('user_id', merchantUserId)
    .single();
  if (merchantError || !merchant) {
    throw new Error(`Fixture merchant row missing, cannot seed food item: ${merchantError?.message}`);
  }

  const now = new Date();
  const pickupStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const pickupEnd = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();

  const { data: existing } = await admin
    .from('food_items')
    .select('id')
    .eq('slug', RESERVATION_FIXTURE_SLUG)
    .maybeSingle();

  const payload = {
    merchant_id: merchant.id,
    name: 'E2E Réservation Item',
    description: 'Panier de test pour la suite E2E - ne pas modifier.',
    category: 'other',
    original_price: 5000,
    discounted_price: 2000,
    discount_percentage: 60,
    quantity_available: 20,
    quantity_initial: 20,
    pickup_start: pickupStart,
    pickup_end: pickupEnd,
    is_available: true,
  };

  if (existing) {
    await admin.from('food_items').update(payload).eq('id', existing.id);
  } else {
    await admin.from('food_items').insert({ ...payload, slug: RESERVATION_FIXTURE_SLUG });
  }
}

export default async function globalSetup() {
  let merchantUserId: string | null = null;

  for (const fixture of Object.values(TEST_USERS)) {
    const user = await ensureAuthUser(fixture.email, fixture.password, fixture.role, fixture.metadata);
    await ensureProfile(user.id, fixture.email, fixture.role, fixture.fullName);

    if (fixture.role === 'merchant' && fixture.metadata) {
      await ensureApprovedMerchant(user.id, fixture.email, fixture.metadata);
      merchantUserId = user.id;
    } else if (fixture.role === 'farmer' && fixture.metadata) {
      await ensureApprovedFarmer(user.id, fixture.email, fixture.metadata);
    } else if (fixture.role === 'driver' && fixture.metadata) {
      await ensureApprovedDriver(user.id, fixture.email, fixture.metadata);
    }
  }

  if (merchantUserId) {
    await ensureReservationFoodItem(merchantUserId);
  }

  console.log(`[e2e/global-setup] ${Object.keys(TEST_USERS).length} fixture accounts ready.`);
}
