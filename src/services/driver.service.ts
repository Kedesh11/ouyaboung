// ============================================
// Driver Service - Driver Directory Business Logic
// ouyaboung Platform - Chauffeurs / livraison
// ============================================

import {
  getDriverById,
  getDriverByUserId,
  createDriver,
  updateDriver,
} from '@/api';
import type { ApiResponse, Driver, VehicleType, GabonCity } from '@/types';

/**
 * Get driver by ID
 */
export const getDriver = async (driverId: string): Promise<ApiResponse<Driver>> => {
  return getDriverById(driverId);
};

/**
 * Get driver profile for current user
 */
export const getMyDriverProfile = async (userId: string): Promise<ApiResponse<Driver>> => {
  return getDriverByUserId(userId);
};

export const updateDriverPhotoByUserId = async (
  userId: string,
  photoUrl: string
): Promise<ApiResponse<Driver>> => {
  const driverResult = await getDriverByUserId(userId);
  if (!driverResult.success || !driverResult.data) {
    return {
      data: null,
      error: driverResult.error || { code: 'DRIVER_NOT_FOUND', message: 'Profil chauffeur introuvable' },
      success: false,
    };
  }

  return updateDriver(driverResult.data.id, { photo_url: photoUrl });
};

/**
 * Register as a new driver
 */
export const registerDriver = async (data: {
  userId: string;
  fullName: string;
  vehicleType: VehicleType;
  plateNumber?: string;
  phone: string;
  email: string;
  city: GabonCity;
  deliveryZone?: string;
}): Promise<ApiResponse<Driver>> => {
  return createDriver({
    user_id: data.userId,
    full_name: data.fullName,
    vehicle_type: data.vehicleType,
    plate_number: data.plateNumber,
    phone: data.phone,
    email: data.email,
    city: data.city,
    delivery_zone: data.deliveryZone,
    is_verified: false,
    is_active: false,
    is_refused: false,
  });
};

/**
 * Create a default driver profile for an authenticated user (pending validation).
 */
export const createDefaultDriverProfile = async (input: {
  userId: string;
  fullName: string;
  vehicleType?: VehicleType;
  phone?: string;
  email?: string;
  city?: GabonCity;
  photoUrl?: string | null;
}): Promise<ApiResponse<Driver>> => {
  return createDriver({
    user_id: input.userId,
    full_name: input.fullName,
    vehicle_type: input.vehicleType || 'other',
    phone: input.phone || 'À compléter',
    email: input.email || '',
    city: input.city || 'Libreville',
    photo_url: input.photoUrl ?? undefined,
    is_verified: false,
    is_active: false,
    is_refused: false,
  });
};

/**
 * Update driver profile
 */
export const updateDriverProfile = async (
  driverId: string,
  data: {
    fullName?: string;
    vehicleType?: VehicleType;
    plateNumber?: string;
    phone?: string;
    email?: string;
    city?: GabonCity;
    deliveryZone?: string;
    photoUrl?: string;
    isActive?: boolean;
  }
): Promise<ApiResponse<Driver>> => {
  const updates: Partial<Driver> = {
    full_name: data.fullName,
    vehicle_type: data.vehicleType,
    plate_number: data.plateNumber,
    phone: data.phone,
    email: data.email,
    city: data.city,
    delivery_zone: data.deliveryZone,
    photo_url: data.photoUrl,
    is_active: data.isActive,
  };

  Object.keys(updates).forEach(key => {
    if (updates[key as keyof typeof updates] === undefined) {
      delete updates[key as keyof typeof updates];
    }
  });

  return updateDriver(driverId, updates);
};

/**
 * Get vehicle type display name
 */
export const getVehicleTypeName = (type: VehicleType): string => {
  const names: Record<VehicleType, string> = {
    moto: 'Moto',
    voiture: 'Voiture',
    camionnette: 'Camionnette',
    tricycle: 'Tricycle',
    other: 'Autre',
  };
  return names[type] || type;
};
