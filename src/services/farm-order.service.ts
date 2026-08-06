// ============================================
// Farm Order Service - Marché B2B commerçant <-> agriculteur
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import {
  createFarmOrder as createFarmOrderApi,
  getFarmOrderById,
  getFarmOrdersByMerchant,
  getFarmOrdersByFarmer,
  updateFarmOrderStatus,
  cancelFarmOrderViaRPC as cancelFarmOrderViaRPCApi,
} from '@/api';
import type {
  ApiResponse,
  FarmOrder,
  FarmOrderStatus,
  CreateFarmOrderInput,
  PaginatedResponse,
} from '@/types';

export { cancelFarmOrderViaRPCApi as cancelFarmOrderViaRPC };

/**
 * Place a new B2B order with a farmer
 */
export const createFarmOrder = async (
  input: CreateFarmOrderInput
): Promise<ApiResponse<FarmOrder>> => {
  return createFarmOrderApi(input);
};

/**
 * Get a farm order by ID
 */
export const getFarmOrder = async (orderId: string): Promise<ApiResponse<FarmOrder>> => {
  return getFarmOrderById(orderId);
};

/**
 * Get orders placed by a merchant
 */
export const getMerchantFarmOrders = async (
  merchantId: string,
  options?: { status?: FarmOrderStatus; page?: number; perPage?: number }
): Promise<ApiResponse<PaginatedResponse<FarmOrder>>> => {
  const limit = options?.perPage || 50;
  const offset = ((options?.page || 1) - 1) * limit;

  return getFarmOrdersByMerchant(merchantId, options?.status, limit, offset);
};

/**
 * Get orders received by a farmer
 */
export const getFarmerFarmOrders = async (
  farmerId: string,
  options?: { status?: FarmOrderStatus; page?: number; perPage?: number }
): Promise<ApiResponse<PaginatedResponse<FarmOrder>>> => {
  const limit = options?.perPage || 50;
  const offset = ((options?.page || 1) - 1) * limit;

  return getFarmOrdersByFarmer(farmerId, options?.status, limit, offset);
};

/**
 * Confirm an order (farmer action)
 */
export const confirm = async (orderId: string): Promise<ApiResponse<FarmOrder>> => {
  return updateFarmOrderStatus(orderId, 'confirmed');
};

/**
 * Refuse an order (farmer action, motif obligatoire)
 */
export const refuse = async (
  orderId: string,
  reason: string
): Promise<ApiResponse<FarmOrder>> => {
  return updateFarmOrderStatus(orderId, 'refused', { refusal_reason: reason });
};

/**
 * Mark an order ready (farmer action)
 */
export const markReady = async (orderId: string): Promise<ApiResponse<FarmOrder>> => {
  return updateFarmOrderStatus(orderId, 'ready');
};

/**
 * Mark an order delivered (farmer action, closes the order)
 */
export const markDelivered = async (orderId: string): Promise<ApiResponse<FarmOrder>> => {
  return updateFarmOrderStatus(orderId, 'delivered');
};

/**
 * Cancel an order (merchant action, only while pending/confirmed)
 */
export const cancel = async (
  orderId: string,
  reason?: string
): Promise<ApiResponse<any>> => {
  return cancelFarmOrderViaRPCApi(orderId, reason);
};

/**
 * Get order status display text
 */
export const getStatusText = (status: FarmOrderStatus): string => {
  const texts: Record<FarmOrderStatus, string> = {
    pending: 'En attente',
    confirmed: 'Confirmée',
    refused: 'Refusée',
    ready: 'Prête',
    delivered: 'Livrée',
    cancelled: 'Annulée',
  };
  return texts[status] || status;
};

/**
 * Get order status color class
 */
export const getStatusColor = (status: FarmOrderStatus): string => {
  const colors: Record<FarmOrderStatus, string> = {
    pending: 'bg-warning/10 text-warning',
    confirmed: 'bg-primary/10 text-primary',
    refused: 'bg-destructive/10 text-destructive',
    ready: 'bg-success/10 text-success',
    delivered: 'bg-success/10 text-success',
    cancelled: 'bg-destructive/10 text-destructive',
  };
  return colors[status] || 'bg-muted text-muted-foreground';
};

/**
 * Check if order can be cancelled (merchant action)
 */
export const canCancel = (order: FarmOrder): boolean => {
  return ['pending', 'confirmed'].includes(order.status);
};

/**
 * Format order for display
 */
export const formatFarmOrderForDisplay = (order: FarmOrder) => {
  return {
    id: order.id,
    farmerName: order.farmer?.farm_name || 'Exploitation',
    merchantName: order.merchant?.business_name || 'Commerce',
    productName: order.farm_product?.name || 'Produit',
    quantity: `${order.quantity} ${order.unit}`,
    totalPrice: `${order.total_price.toLocaleString()} XAF`,
    status: getStatusText(order.status),
    statusColor: getStatusColor(order.status),
    specialRequest: order.special_request,
    requestedDate: order.requested_date,
    createdAt: new Date(order.created_at).toLocaleDateString('fr-FR'),
  };
};
