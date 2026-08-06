// ============================================
// Services Layer - Centralized Exports
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

// Auth Service
export {
  login,
  register,
  logout,
  getAuthSession,
  getAuthUser,
  getCurrentUser,
  requestPasswordReset,
  changePassword,
  subscribeToAuthChanges,
  loginWithOtp,
  verifyOtpCode,
  isAuthenticated,
  getUserRole,
} from './auth.service';

// User Service
export {
  getProfile,
  updateProfile,
  getNotificationPreferences,
  updateNotificationPreferences,
  getFavorites,
  addFavorite,
  removeFavorite,
  toggleFavorite,
  getImpactStats,
  formatImpactForDisplay,
  // profile by auth user id fallback
  // exported via getProfile which now handles both id and user_id
} from './user.service';

// Merchant Service
export {
  listMerchants,
  getMerchant,
  getMyMerchantProfile,
  registerMerchant,
  updateMerchantProfile,
  findNearbyMerchants,
  search as searchMerchants,
  getMerchantStats,
  formatMerchantImpact,
  isMerchantOpenNow,
  getMerchantTypeName,
  createDefaultMerchantProfile,
  updateMerchantLogoByUserId,
} from './merchant.service';

// Inventory Service
export {
  getAvailableItems,
  getItem,
  getMerchantItems,
  createListing,
  updateListing,
  deleteListing,
  search as searchInventory,
  getCategories,
  reserveQuantity,
  restoreQuantity,
  getCategoryName,
  calculateSavings,
  formatPrice,
  isExpiringSoon,
  isPickupPassed,
} from './inventory.service';

// Farmer Service
export {
  listFarmers,
  getFarmer,
  getMyFarmerProfile,
  getFarmerBySlugName,
  registerFarmer,
  updateFarmerProfile,
  search as searchFarmers,
  createDefaultFarmerProfile,
  updateFarmerLogoByUserId,
  getFarmerTypeName,
} from './farmer.service';

// Farm Product Service
export {
  getItem as getFarmProductItem,
  getItemBySlug as getFarmProductItemBySlug,
  getFarmerItems,
  createListing as createFarmProductListing,
  updateListing as updateFarmProductListing,
  deleteListing as deleteFarmProductListing,
  getCategoryName as getFarmProductCategoryName,
  formatPricePerUnit,
  isAvailabilityExpired,
} from './farm-product.service';

// Contact Service
export * from './contact.service';

// Order Service
export {
  createReservation,
  getOrder,
  getUserOrders,
  getMerchantOrders,
  cancel as cancelOrder,
  confirm as confirmOrder,
  markReady as markOrderReady,
  complete as completeOrder,
  addReview,
  getActiveOrders,
  getActive, // Export generic active orders fetcher
  getStatusText,
  getStatusColor,
  canCancel,
  canReview,
  formatOrderForDisplay,
  calculateTotalSavings,
  cancelOrderViaRPC,
} from './order.service';

// Storage Service
export {
  uploadToBucket,
  uploadAvatar,
  uploadMerchantAsset,
  uploadMerchantDocument,
  uploadFarmerAsset,
} from './storage.service';

// Realtime Service
export {
  subscribeToTableChanges,
  unsubscribeChannel,
  subscribeToOrders,
  subscribeToTransactions,
} from './realtime.service';

// Payment Transactions Service
export {
  getUserPaymentTransactions,
  getMerchantPaymentTransactions,
  getAdminPaymentTransactions,
  syncSingPayTransactionStatus,
} from './payment-transactions.service';

export {
  getMerchantPayoutAccounts,
  createMerchantPayoutAccount,
} from './payout.service';
export type {
  MerchantPayoutAccount,
  PayoutOperator,
} from './payout.service';

// QR Service
export { validatePickupCode } from './qr.service';

// Impact Service
export {
  getGlobalStats,
  getUserStats,
  getMerchantStats as getMerchantImpactStats,
  calculateCO2,
  getLeaderboard,
  getUserMonthlyImpact,
  generateReport,
  formatGlobalImpact,
  calculateEquivalents,
  getImpactTier,
  formatLargeNumber,
} from './impact.service';

// Transaction Service
export {
  createTransaction,
  processPayment,
  validateQRCode,
  completeTransaction,
  cancelTransaction,
  getUserTransactions,
  getTransaction,
  getTransactionStatusText,
  getTransactionStatusColor,
} from './transaction.service';

// Notification Service
export {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  archiveNotification,
  deleteNotification,
  createNotification,
  getPreferences as getNotificationPrefs,
  updatePreferences as updateNotificationPrefs,
  sendOrderNotification,
  sendQRCodeNotification,
} from './notification.service';

// Geolocation Service
export {
  resolveUserLocation,
  getCachedUserLocation,
  clearCachedUserLocation,
  formatLocationAccuracy,
  isValidCoordinate,
  isWithinGabonBounds,
  GABON_LOCATION_BOUNDS,
} from './geolocation.service';
export type { UserGeolocation } from './geolocation.service';
