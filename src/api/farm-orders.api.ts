// ============================================
// Farm Orders API - Marché B2B commerçant <-> agriculteur
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';
import type {
  ApiResponse,
  FarmOrder,
  FarmOrderStatus,
  CreateFarmOrderInput,
  PaginatedResponse,
} from '@/types';

const FARM_PRODUCT_LIST_COLUMNS =
  'id,farmer_id,name,description,category,unit,price_per_unit,quantity_available,available_from,available_until,image_url,images,is_available,slug,created_at,updated_at';
const FARMER_LIST_COLUMNS =
  'id,user_id,farm_name,farmer_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';
const MERCHANT_LIST_COLUMNS =
  'id,user_id,business_name,business_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,opening_hours,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';
const FARM_ORDER_LIST_COLUMNS =
  'id,merchant_id,farmer_id,farm_product_id,quantity,unit,price_per_unit,total_price,special_request,requested_date,status,confirmed_at,refused_at,refusal_reason,ready_at,delivered_at,cancelled_at,cancellation_reason,created_at,updated_at';

const toOne = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

/**
 * Create a new B2B farm order (atomic RPC: locks the product row, checks
 * approval/availability, decrements quantity_available)
 */
export const createFarmOrder = async (
  orderData: CreateFarmOrderInput
): Promise<ApiResponse<FarmOrder>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  const { data: rpcData, error: rpcError } = await client.rpc('create_farm_order_atomic', {
    p_farm_product_id: orderData.farm_product_id,
    p_quantity: orderData.quantity,
    p_special_request: orderData.special_request || null,
    p_requested_date: orderData.requested_date || null,
  });

  if (rpcError) {
    return {
      data: null,
      error: {
        code: rpcError.code || 'CREATE_FARM_ORDER_ATOMIC_RPC_ERROR',
        message: rpcError.message || 'Échec de la création de la commande',
      },
      success: false,
    };
  }

  const payload = rpcData as {
    success?: boolean;
    order_id?: string;
    code?: string;
    message?: string;
  } | null;

  if (!payload?.success || !payload.order_id) {
    return {
      data: null,
      error: {
        code: payload?.code || 'CREATE_FARM_ORDER_ATOMIC_FAILED',
        message: payload?.message || 'Échec de la création de la commande',
      },
      success: false,
    };
  }

  return getFarmOrderById(payload.order_id);
};

/**
 * Get a farm order by ID
 */
export const getFarmOrderById = async (
  orderId: string
): Promise<ApiResponse<FarmOrder>> => {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FARM_ORDERS)
    .select(`${FARM_ORDER_LIST_COLUMNS}, farm_products(${FARM_PRODUCT_LIST_COLUMNS}), farmers(${FARMER_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS})`)
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  const order = data ? {
    ...data,
    farm_product: toOne((data as any).farm_products) ?? undefined,
    farmer: toOne((data as any).farmers) ?? undefined,
    merchant: toOne((data as any).merchants) ?? undefined,
  } as FarmOrder : null;

  return {
    data: order,
    error: null,
    success: true,
  };
};

/**
 * Get farm orders placed by a merchant
 */
export const getFarmOrdersByMerchant = async (
  merchantId: string,
  status?: FarmOrderStatus,
  limit: number = 50,
  offset: number = 0
): Promise<ApiResponse<PaginatedResponse<FarmOrder>>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  let query = client
    .from(DB_TABLES.FARM_ORDERS)
    .select(`${FARM_ORDER_LIST_COLUMNS}, farm_products(${FARM_PRODUCT_LIST_COLUMNS}), farmers(${FARMER_LIST_COLUMNS})`, { count: 'exact' })
    .eq('merchant_id', merchantId);

  if (status) {
    query = query.eq('status', status);
  }

  query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  const orders = data?.map((o) => ({
    ...o,
    farm_product: toOne((o as any).farm_products),
    farmer: toOne((o as any).farmers),
  })) as FarmOrder[];

  return {
    data: {
      data: orders,
      total: count || 0,
      page: Math.floor(offset / limit) + 1,
      per_page: limit,
      total_pages: Math.ceil((count || 0) / limit),
    },
    error: null,
    success: true,
  };
};

/**
 * Get farm orders received by a farmer
 */
export const getFarmOrdersByFarmer = async (
  farmerId: string,
  status?: FarmOrderStatus,
  limit: number = 50,
  offset: number = 0
): Promise<ApiResponse<PaginatedResponse<FarmOrder>>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  let query = client
    .from(DB_TABLES.FARM_ORDERS)
    .select(`${FARM_ORDER_LIST_COLUMNS}, farm_products(${FARM_PRODUCT_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS})`, { count: 'exact' })
    .eq('farmer_id', farmerId);

  if (status) {
    query = query.eq('status', status);
  }

  query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  const orders = data?.map((o) => ({
    ...o,
    farm_product: toOne((o as any).farm_products),
    merchant: toOne((o as any).merchants),
  })) as FarmOrder[];

  return {
    data: {
      data: orders,
      total: count || 0,
      page: Math.floor(offset / limit) + 1,
      per_page: limit,
      total_pages: Math.ceil((count || 0) / limit),
    },
    error: null,
    success: true,
  };
};

/**
 * Update farm order status (farmer-driven: confirmed/refused/ready/delivered)
 */
export const updateFarmOrderStatus = async (
  orderId: string,
  status: FarmOrderStatus,
  additionalData?: Record<string, unknown>
): Promise<ApiResponse<FarmOrder>> => {
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
    case 'confirmed':
      updateData.confirmed_at = new Date().toISOString();
      break;
    case 'refused':
      updateData.refused_at = new Date().toISOString();
      break;
    case 'ready':
      updateData.ready_at = new Date().toISOString();
      break;
    case 'delivered':
      updateData.delivered_at = new Date().toISOString();
      break;
  }

  const { data, error } = await client
    .from(DB_TABLES.FARM_ORDERS)
    .update(updateData)
    .eq('id', orderId)
    .select(`${FARM_ORDER_LIST_COLUMNS}, farm_products(${FARM_PRODUCT_LIST_COLUMNS}), farmers(${FARMER_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS})`)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  const order: FarmOrder = {
    ...data,
    farm_product: toOne((data as any).farm_products) ?? undefined,
    farmer: toOne((data as any).farmers) ?? undefined,
    merchant: toOne((data as any).merchants) ?? undefined,
  };

  return {
    data: order,
    error: null,
    success: true,
  };
};

/**
 * Cancel a farm order using the RPC function (merchant action, ownership +
 * status guard enforced server-side, restores farm_products quantity)
 */
export const cancelFarmOrderViaRPC = async (
  orderId: string,
  reason?: string
): Promise<ApiResponse<any>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client.rpc('cancel_farm_order', {
    p_order_id: orderId,
    p_cancellation_reason: reason || null,
  });

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  if (data && typeof data === 'object') {
    if ((data as any).success === false) {
      return {
        data: null,
        error: { code: 'RPC_ERROR', message: (data as any).error || 'Erreur inconnue' },
        success: false,
      };
    }

    return {
      data: (data as any).data,
      error: null,
      success: true,
    };
  }

  return {
    data: null,
    error: { code: 'INVALID_RESPONSE', message: 'Réponse RPC invalide' },
    success: false,
  };
};
