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
export { API_ROUTES, DB_TABLES } from './routes';
export type { TableName } from './routes';

// Auth API
export {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getSession,
  getCurrentUser,
  resetPassword,
  updatePassword,
  onAuthStateChange,
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
  addToFavorites,
  removeFromFavorites,
  getUserImpact as getUserImpactApi,
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
  getFarmerById,
  getFarmerByUserId,
  getFarmerBySlug,
  createFarmer,
  updateFarmer,
  searchFarmers,
} from './farmers.api';

// Farm Products API
export {
  getFarmProductById,
  getFarmProductBySlug,
  getFarmProductsByFarmer,
  createFarmProduct,
  updateFarmProduct,
  deleteFarmProduct,
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
  getDriverById,
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
  getOrderByTrackingCode,
} from './orders.api';

// Orders RPC (bypasses RLS)
export { cancelOrderViaRPC } from './orders-rpc.api';

// Pricing API
export {
  getPricingRecommendation,
  calculateTimeBasedDiscount,
  getPricingHistory,
  savePricingRecommendation,
  getAverageDiscountByCategory,
} from './pricing.api';

// Impact API
export {
  getGlobalImpact,
  getUserImpact,
  getMerchantImpact,
  calculateCO2Impact,
  getImpactLeaderboard,
  logImpact,
  generateImpactReport,
  getUserMonthlyImpact,
} from './impact.api';
