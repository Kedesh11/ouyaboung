// ============================================
// Delivery Service - Livraison agriculteur -> commerçant
// ouyaboung Platform - Chauffeurs / livraison
// ============================================

import {
  getAvailableDeliveries,
  getDeliveriesByDriver,
  getDeliveryByFarmOrderId,
  acceptDeliveryViaRPC,
  updateDeliveryStatus,
  insertDriverLocation,
  getLatestDriverLocation,
} from '@/api';
import type { ApiResponse, Delivery, DeliveryStatus, DriverLocation } from '@/types';

/**
 * Get the pool of deliveries available for drivers to claim
 */
export const getAvailableForPickup = async (): Promise<ApiResponse<Delivery[]>> => {
  return getAvailableDeliveries();
};

/**
 * Get deliveries assigned to a driver
 */
export const getDriverDeliveries = async (
  driverId: string,
  status?: DeliveryStatus
): Promise<ApiResponse<Delivery[]>> => {
  return getDeliveriesByDriver(driverId, status);
};

/**
 * Get the delivery tied to a farm order (farmer/merchant order pages)
 */
export const getDelivery = async (farmOrderId: string): Promise<ApiResponse<Delivery | null>> => {
  return getDeliveryByFarmOrderId(farmOrderId);
};

/**
 * Accept a delivery job (driver action, atomic claim via RPC)
 */
export const acceptDelivery = async (deliveryId: string): Promise<ApiResponse<{ delivery_id: string }>> => {
  return acceptDeliveryViaRPC(deliveryId);
};

/**
 * Mark a delivery as picked up from the farmer (driver action)
 */
export const markPickedUp = async (deliveryId: string): Promise<ApiResponse<Delivery>> => {
  return updateDeliveryStatus(deliveryId, 'picked_up');
};

/**
 * Mark a delivery as in transit (driver action)
 */
export const markInTransit = async (deliveryId: string): Promise<ApiResponse<Delivery>> => {
  return updateDeliveryStatus(deliveryId, 'in_transit');
};

/**
 * Mark a delivery as delivered, with a confirmation photo (driver action)
 */
export const markDelivered = async (
  deliveryId: string,
  proofPhotoUrl?: string
): Promise<ApiResponse<Delivery>> => {
  return updateDeliveryStatus(deliveryId, 'delivered', proofPhotoUrl ? { proof_photo_url: proofPhotoUrl } : undefined);
};

/**
 * Mark a delivery as failed (driver action, motif obligatoire)
 */
export const markFailed = async (
  deliveryId: string,
  reason: string
): Promise<ApiResponse<Delivery>> => {
  return updateDeliveryStatus(deliveryId, 'failed', { cancellation_reason: reason });
};

/**
 * Record a throttled GPS position for an active delivery
 */
export const recordLocation = async (
  driverId: string,
  deliveryId: string,
  latitude: number,
  longitude: number
): Promise<ApiResponse<null>> => {
  return insertDriverLocation(driverId, deliveryId, latitude, longitude);
};

/**
 * Get the last known position for a delivery
 */
export const getLastKnownLocation = async (deliveryId: string): Promise<ApiResponse<DriverLocation | null>> => {
  return getLatestDriverLocation(deliveryId);
};

/**
 * Get delivery status display text
 */
export const getStatusText = (status: DeliveryStatus): string => {
  const texts: Record<DeliveryStatus, string> = {
    unassigned: 'À prendre en charge',
    accepted: 'Acceptée',
    picked_up: 'Récupérée',
    in_transit: 'En route',
    delivered: 'Livrée',
    failed: 'Échec',
    cancelled: 'Annulée',
  };
  return texts[status] || status;
};

/**
 * Get delivery status color class
 */
export const getStatusColor = (status: DeliveryStatus): string => {
  const colors: Record<DeliveryStatus, string> = {
    unassigned: 'bg-muted text-muted-foreground',
    accepted: 'bg-primary/10 text-primary',
    picked_up: 'bg-blue-500/10 text-blue-600',
    in_transit: 'bg-blue-500/10 text-blue-600',
    delivered: 'bg-success/10 text-success',
    failed: 'bg-destructive/10 text-destructive',
    cancelled: 'bg-destructive/10 text-destructive',
  };
  return colors[status] || 'bg-muted text-muted-foreground';
};

/**
 * Whether the driver's location should currently be tracked
 */
export const isDeliveryActive = (status: DeliveryStatus): boolean => {
  return ['accepted', 'picked_up', 'in_transit'].includes(status);
};

/**
 * Format a delivery for display
 */
export const formatDeliveryForDisplay = (delivery: Delivery) => {
  const farmOrder = delivery.farm_order;
  return {
    id: delivery.id,
    farmerName: farmOrder?.farmer?.farm_name || 'Exploitation',
    farmerCity: farmOrder?.farmer?.city,
    farmerAddress: farmOrder?.farmer?.address,
    merchantName: farmOrder?.merchant?.business_name || 'Commerce',
    merchantCity: farmOrder?.merchant?.city,
    merchantAddress: farmOrder?.merchant?.address,
    productName: farmOrder?.farm_product?.name || 'Produit',
    quantity: farmOrder ? `${farmOrder.quantity} ${farmOrder.unit}` : '',
    driverName: delivery.driver?.full_name,
    status: getStatusText(delivery.status),
    statusColor: getStatusColor(delivery.status),
    createdAt: new Date(delivery.created_at).toLocaleDateString('fr-FR'),
  };
};
