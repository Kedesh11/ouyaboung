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
} from './order.service';

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
} from './geolocation.service';
