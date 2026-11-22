// ============================================
// API Layer - Centralized Exports
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

// Supabase Client
export {
  supabaseClient,
  getSupabaseClient,
  isSupabaseConfigured,
  requireSupabaseClient
} from './supabaseClient';

// Routes & Tables
export { DB_TABLES } from './routes';

// Auth API
export {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getSession,
  getCurrentUser,
  resetPassword,
  updatePassword,
  signInWithOtp,
  verifyOtp,
  updateUser,
} from './auth.api';

// Users API
export {
  getUserProfile,
  updateUserProfile,
  getUserPreferences,
  updateUserPreferences,
  getUserFavorites,
  removeFromFavorites,
  getUserProfileByUserId,
} from './users.api';

// Merchants API
export {
  getMerchants,
  getMerchantById,
  getMerchantByUserId,
  createMerchant,
  updateMerchant,
  getNearbyMerchants,
  getMerchantImpact as getMerchantImpactApi,
  searchMerchants,
  getMerchantBySlug,
} from './merchants.api';

// Inventory API
export {
  getAvailableFoodItems,
  getFoodItemById,
  getFoodItemsByMerchant,
  createFoodItem,
  updateFoodItem,
  deleteFoodItem,
  searchFoodItems,
  getFoodCategories,
  updateFoodItemQuantity,
  getFoodItemBySlug,
} from './inventory.api';

// Farmers API
export {
  getFarmers,
  getFarmerByUserId,
  getFarmerBySlug,
  createFarmer,
  updateFarmer,
} from './farmers.api';

// Farm Products API
export {
  getFarmProductsByFarmer,
  createFarmProduct,
  updateFarmProduct,
} from './farm-products.api';

// Farm Orders API
export {
  createFarmOrder,
  getFarmOrderById,
  getFarmOrdersByMerchant,
  getFarmOrdersByFarmer,
  updateFarmOrderStatus,
  cancelFarmOrderViaRPC,
} from './farm-orders.api';

// Drivers API
export {
  getDriverByUserId,
  createDriver,
  updateDriver,
} from './drivers.api';

// Deliveries API
export {
  getAvailableDeliveries,
  getDeliveriesByDriver,
  getDeliveryByFarmOrderId,
  acceptDeliveryViaRPC,
  updateDeliveryStatus,
  insertDriverLocation,
  getLatestDriverLocation,
} from './deliveries.api';

// Orders API
export {
  createOrder,
  getOrderById,
  getOrdersByUser,
  getOrdersByMerchant,
  updateOrderStatus,
  cancelOrder,
  confirmOrder,
  markOrderReady,
  completeOrder,
  addOrderReview,
  getActiveOrders,
} from './orders.api';

// Orders RPC (bypasses RLS)
export { cancelOrderViaRPC } from './orders-rpc.api';

// Pricing API

// Impact API
export {
  getUserImpact,
  getMerchantImpact,
  getUserMonthlyImpact,
} from './impact.api';
