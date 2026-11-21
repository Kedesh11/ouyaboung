// ============================================
// API Routes - Centralized Endpoint Definitions
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

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

