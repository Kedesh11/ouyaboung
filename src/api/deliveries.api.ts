// ============================================
// Deliveries API - Livraison agriculteur -> commerçant
// ouyaboung Platform - Chauffeurs / livraison
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';
import type { ApiResponse, Delivery, DeliveryStatus, DriverLocation } from '@/types';

const FARM_PRODUCT_LIST_COLUMNS =
  'id,farmer_id,name,description,category,unit,price_per_unit,quantity_available,available_from,available_until,image_url,images,is_available,slug,created_at,updated_at';
const FARMER_LIST_COLUMNS =
  'id,user_id,farm_name,farmer_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';
const MERCHANT_LIST_COLUMNS =
  'id,user_id,business_name,business_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,opening_hours,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';
const FARM_ORDER_LIST_COLUMNS =
  'id,merchant_id,farmer_id,farm_product_id,quantity,unit,price_per_unit,total_price,special_request,requested_date,status,confirmed_at,refused_at,refusal_reason,ready_at,delivered_at,cancelled_at,cancellation_reason,created_at,updated_at';
const DRIVER_LIST_COLUMNS =
  'id,user_id,full_name,vehicle_type,plate_number,phone,email,photo_url,city,delivery_zone,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,created_at,updated_at';
const DELIVERY_LIST_COLUMNS =
  'id,farm_order_id,driver_id,status,accepted_at,picked_up_at,delivered_at,cancelled_at,cancellation_reason,proof_photo_url,created_at,updated_at';

const FARM_ORDER_NESTED_SELECT =
  `farm_orders(${FARM_ORDER_LIST_COLUMNS}, farm_products(${FARM_PRODUCT_LIST_COLUMNS}), farmers(${FARMER_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS}))`;

const toOne = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const hydrateDelivery = (row: any): Delivery => {
  const farmOrder = toOne(row.farm_orders);
  return {
    ...row,
    farm_order: farmOrder
      ? {
          ...farmOrder,
          farm_product: toOne(farmOrder.farm_products) ?? undefined,
          farmer: toOne(farmOrder.farmers) ?? undefined,
          merchant: toOne(farmOrder.merchants) ?? undefined,
        }
      : undefined,
    driver: toOne(row.drivers) ?? undefined,
  } as Delivery;
};

/**
 * Get the pool of unassigned deliveries available for approved drivers to claim.
 * RLS already scopes this to status='unassigned' + approved driver.
 */
export const getAvailableDeliveries = async (): Promise<ApiResponse<Delivery[]>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.DELIVERIES)
    .select(`${DELIVERY_LIST_COLUMNS}, ${FARM_ORDER_NESTED_SELECT}`)
    .eq('status', 'unassigned')
    .order('created_at', { ascending: true });

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: (data || []).map(hydrateDelivery),
    error: null,
    success: true,
  };
};

/**
 * Get deliveries assigned to a driver
 */
export const getDeliveriesByDriver = async (
  driverId: string,
  status?: DeliveryStatus
): Promise<ApiResponse<Delivery[]>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  let query = client
    .from(DB_TABLES.DELIVERIES)
    .select(`${DELIVERY_LIST_COLUMNS}, ${FARM_ORDER_NESTED_SELECT}`)
    .eq('driver_id', driverId);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: (data || []).map(hydrateDelivery),
    error: null,
    success: true,
  };
};

/**
 * Get the delivery tied to a farm order (used by farmer/merchant order pages)
 */
export const getDeliveryByFarmOrderId = async (
  farmOrderId: string
): Promise<ApiResponse<Delivery | null>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.DELIVERIES)
    .select(`${DELIVERY_LIST_COLUMNS}, drivers(${DRIVER_LIST_COLUMNS})`)
    .eq('farm_order_id', farmOrderId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data ? hydrateDelivery(data) : null,
    error: null,
    success: true,
  };
};

/**
 * Accept a delivery (atomic RPC: locks the row, checks driver approval,
 * prevents two drivers claiming the same job)
 */
export const acceptDeliveryViaRPC = async (
  deliveryId: string
): Promise<ApiResponse<{ delivery_id: string }>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data: rpcData, error: rpcError } = await client.rpc('accept_delivery', {
    p_delivery_id: deliveryId,
  });

  if (rpcError) {
    return {
      data: null,
      error: { code: rpcError.code || 'ACCEPT_DELIVERY_RPC_ERROR', message: rpcError.message },
      success: false,
    };
  }

  const payload = rpcData as { success?: boolean; delivery_id?: string; code?: string; message?: string } | null;

  if (!payload?.success) {
    return {
      data: null,
      error: { code: payload?.code || 'ACCEPT_DELIVERY_FAILED', message: payload?.message || 'Échec de l’acceptation' },
      success: false,
    };
  }

  return {
    data: { delivery_id: payload.delivery_id! },
    error: null,
    success: true,
  };
};

/**
 * Update delivery status (driver-driven: picked_up/in_transit/delivered/failed/cancelled)
 */
export const updateDeliveryStatus = async (
  deliveryId: string,
  status: DeliveryStatus,
  additionalData?: Record<string, unknown>
): Promise<ApiResponse<Delivery>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    ...additionalData,
  };

  switch (status) {
    case 'picked_up':
      updateData.picked_up_at = new Date().toISOString();
      break;
    case 'delivered':
      updateData.delivered_at = new Date().toISOString();
      break;
    case 'cancelled':
    case 'failed':
      updateData.cancelled_at = new Date().toISOString();
      break;
  }

  const { data, error } = await client
    .from(DB_TABLES.DELIVERIES)
    .update(updateData)
    .eq('id', deliveryId)
    .select(`${DELIVERY_LIST_COLUMNS}, ${FARM_ORDER_NESTED_SELECT}`)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: hydrateDelivery(data),
    error: null,
    success: true,
  };
};

/**
 * Persist a throttled GPS position for an active delivery
 */
export const insertDriverLocation = async (
  driverId: string,
  deliveryId: string,
  latitude: number,
  longitude: number
): Promise<ApiResponse<null>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { error } = await client.from(DB_TABLES.DRIVER_LOCATIONS).insert({
    driver_id: driverId,
    delivery_id: deliveryId,
    latitude,
    longitude,
  });

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return { data: null, error: null, success: true };
};

/**
 * Get the last known position for a delivery (fallback until a live
 * broadcast update arrives)
 */
export const getLatestDriverLocation = async (
  deliveryId: string
): Promise<ApiResponse<DriverLocation | null>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.DRIVER_LOCATIONS)
    .select('id,driver_id,delivery_id,latitude,longitude,recorded_at,created_at')
    .eq('delivery_id', deliveryId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as DriverLocation | null,
    error: null,
    success: true,
  };
};
