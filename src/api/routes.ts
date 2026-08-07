// ============================================
// API Routes - Centralized Endpoint Definitions
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

/**
 * All API routes are defined here.
 * No endpoint strings should appear elsewhere in the codebase.
 */
export const API_ROUTES = {
  // ==========================================
  // Authentication Routes
  // ==========================================
  AUTH: {
    LOGIN: 'auth/login',
    LOGOUT: 'auth/logout',
    SIGNUP: 'auth/signup',
    RESET_PASSWORD: 'auth/reset-password',
    VERIFY_OTP: 'auth/verify-otp',
    REFRESH_TOKEN: 'auth/refresh',
    SESSION: 'auth/session',
  },

  // ==========================================
  // User Management Routes
  // ==========================================
  USERS: {
    PROFILE: 'profiles',
    BY_ID: (id: string) => `profiles/${id}`,
    UPDATE: (id: string) => `profiles/${id}`,
    PREFERENCES: (id: string) => `profiles/${id}/preferences`,
    FAVORITES: (id: string) => `profiles/${id}/favorites`,
    IMPACT: (id: string) => `profiles/${id}/impact`,
  },

  // ==========================================
  // Merchant Routes
  // ==========================================
  MERCHANTS: {
    LIST: 'merchants',
    BY_ID: (id: string) => `merchants/${id}`,
    CREATE: 'merchants',
    UPDATE: (id: string) => `merchants/${id}`,
    VERIFY: (id: string) => `merchants/${id}/verify`,
    PRODUCTS: (id: string) => `merchants/${id}/products`,
    ORDERS: (id: string) => `merchants/${id}/orders`,
    STATS: (id: string) => `merchants/${id}/stats`,
    IMPACT: (id: string) => `merchants/${id}/impact`,
    NEARBY: 'merchants/nearby',
  },

  // ==========================================
  // Inventory / Food Items Routes
  // ==========================================
  INVENTORY: {
    LIST: 'food_items',
    BY_ID: (id: string) => `food_items/${id}`,
    CREATE: 'food_items',
    UPDATE: (id: string) => `food_items/${id}`,
    DELETE: (id: string) => `food_items/${id}`,
    SEARCH: 'food_items/search',
    BY_MERCHANT: (merchantId: string) => `food_items/merchant/${merchantId}`,
    AVAILABLE: 'food_items/available',
    CATEGORIES: 'food_items/categories',
  },

  // ==========================================
  // Orders / Reservations Routes
  // ==========================================
  ORDERS: {
    LIST: 'orders',
    BY_ID: (id: string) => `orders/${id}`,
    CREATE: 'orders',
    UPDATE: (id: string) => `orders/${id}`,
    CANCEL: (id: string) => `orders/${id}/cancel`,
    CONFIRM: (id: string) => `orders/${id}/confirm`,
    COMPLETE: (id: string) => `orders/${id}/complete`,
    BY_USER: (userId: string) => `orders/user/${userId}`,
    BY_MERCHANT: (merchantId: string) => `orders/merchant/${merchantId}`,
    ACTIVE: 'orders/active',
    HISTORY: 'orders/history',
  },

  // ==========================================
  // Pricing Routes
  // ==========================================
  PRICING: {
    RECOMMEND: 'pricing/recommend',
    CALCULATE_DISCOUNT: 'pricing/calculate-discount',
    HISTORY: (itemId: string) => `pricing/history/${itemId}`,
    ANALYTICS: 'pricing/analytics',
  },

  // ==========================================
  // Impact / Analytics Routes
  // ==========================================
  IMPACT: {
    GLOBAL: 'impact/global',
    USER: (userId: string) => `impact/user/${userId}`,
    MERCHANT: (merchantId: string) => `impact/merchant/${merchantId}`,
    CALCULATE_CO2: 'impact/calculate-co2',
    REPORT: 'impact/report',
    LEADERBOARD: 'impact/leaderboard',
  },

  // ==========================================
  // Geolocation Routes (Gabon)
  // ==========================================
  GEO: {
    CITIES: 'geo/cities',
    QUARTIERS: (city: string) => `geo/quartiers/${city}`,
    SEARCH: 'geo/search',
    NEARBY: 'geo/nearby',
    REVERSE_GEOCODE: 'geo/reverse',
  },

  // ==========================================
  // Notifications Routes
  // ==========================================
  NOTIFICATIONS: {
    LIST: 'notifications',
    BY_ID: (id: string) => `notifications/${id}`,
    MARK_READ: (id: string) => `notifications/${id}/read`,
    MARK_ALL_READ: 'notifications/read-all',
    PREFERENCES: 'notifications/preferences',
  },

  // ==========================================
  // AI Services Routes
  // ==========================================
  AI: {
    CLASSIFY_FOOD: 'ai/classify-food',
    ESTIMATE_QUANTITY: 'ai/estimate-quantity',
    RECOMMEND_PRICE: 'ai/recommend-price',
    CALCULATE_IMPACT: 'ai/calculate-impact',
    PREDICT_WASTE: 'ai/predict-waste',
    DETECT_FRAUD: 'ai/detect-fraud',
  },

  // ==========================================
  // Edge Functions Base URLs
  // ==========================================
  EDGE_FUNCTIONS: {
    AUTH: 'auth-service',
    USERS: 'user-service',
    MERCHANTS: 'merchant-service',
    INVENTORY: 'inventory-service',
    ORDERS: 'order-service',
    PRICING: 'pricing-service',
    IMPACT: 'impact-service',
    GEO: 'geo-service',
    NOTIFICATIONS: 'notification-service',
    AI: 'ai-service',
  },
} as const;

// Table names for direct Supabase queries
export const DB_TABLES = {
  PROFILES: 'profiles',
  MERCHANTS: 'merchants',
  FOOD_ITEMS: 'food_items',
  ORDERS: 'orders',
  NOTIFICATIONS: 'notifications',
  FAVORITES: 'favorites',
  REVIEWS: 'reviews',
  IMPACT_LOGS: 'impact_logs',
  PRICING_HISTORY: 'pricing_history',
  USER_ROLES: 'user_roles',
  ADMIN_ACTIVITIES: 'admin_activities',
  CONTACT_MESSAGES: 'contact_messages',
  FARMERS: 'farmers',
  FARM_PRODUCTS: 'farm_products',
  FARM_ORDERS: 'farm_orders',
  DRIVERS: 'drivers',
  DELIVERIES: 'deliveries',
  DRIVER_LOCATIONS: 'driver_locations',
} as const;

export type TableName = (typeof DB_TABLES)[keyof typeof DB_TABLES];
