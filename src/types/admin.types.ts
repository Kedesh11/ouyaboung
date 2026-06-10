// ============================================
// Admin Types - Super Admin Dashboard Types
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

// Merchant Status Enum
export type MerchantStatus = 'pending' | 'validated' | 'refused';

// Merchant Registration
export interface MerchantRegistration {
  id: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  businessType: string;
  siret: string;
  description: string;
  status: MerchantStatus;
  createdAt: Date;
  updatedAt: Date;
  validatedAt?: Date;
  refusedAt?: Date;
  refusalReason?: string;
  latitude?: number;
  longitude?: number;
}

// Admin KPIs
export interface AdminKPIs {
  totalMerchants: number;
  activeMerchants: number;
  pendingMerchants: number;
  refusedMerchants: number;
  totalClients: number;
  activeProducts: number;
  activeBaskets: number;
  totalSales: number;
  totalRevenue: number;
  conversionRate: number;
  averageOrderValue: number;
}

// Admin Traffic Analytics
export interface DailyTrafficPoint {
  periodDate: string; // YYYY-MM-DD
  visitors: number;
  authenticatedVisitors: number;
  sessions: number;
  pageViews: number;
  pwaInstalls: number;
}

export interface AdminTrafficMetrics {
  windowDays: number;
  totalRegisteredUsers: number;
  visitorsToday: number;
  visitorsYesterday: number;
  visitorsGrowthPercent: number;
  dailyAverageVisitors: number;
  dailyVisitRatePercent: number;
  pageViewsToday: number;
  sessionsToday: number;
  pwaInstallsTotal: number;
  pwaInstallsLast30d: number;
  recurringVisitors7d: number;
  daily: DailyTrafficPoint[];
}

// Geographic Distribution
export interface GeoDistribution {
  city: string;
  merchantCount: number;
  salesCount: number;
}

// Recent Activity
export interface AdminActivity {
  id: string;
  type:
    | 'merchant_registration'
    | 'merchant_validated'
    | 'merchant_refused'
    | 'sale_completed'
    | 'product_added'
    | 'test_activity'
    | (string & {});
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// Merchant Validation Action
export interface MerchantValidationAction {
  merchantId: string;
  action: 'validate' | 'refuse';
  reason?: string;
  adminId: string;
}

// Admin User
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin';
  createdAt: Date;
}

// Sales Statistics
export interface SalesStats {
  period: string;
  sales: number;
  revenue: number;
  orders: number;
}

// Top Merchant
export interface TopMerchant {
  id: string;
  name: string;
  sales: number;
  revenue: number;
  productsCount: number;
}

// ============================================
// Admin Client
// ============================================

export type AdminClientStatus = 'active' | 'inactive';

export interface AdminClient {
  id: string;            // auth user id
  profileId: string;     // profiles.id
  fullName: string;
  email: string;
  phone?: string;
  city?: string;
  quartier?: string;
  createdAt: Date;
  ordersCount: number;
  totalSpent: number;
  status: AdminClientStatus;
  role: 'user' | 'merchant' | 'admin';
}

// ============================================
// Admin Product
// ============================================

export interface AdminProduct {
  id: string;
  name: string;
  merchantId: string;
  merchantName: string;
  category: string;
  originalPrice: number;
  discountPrice: number;
  quantity: number;
  isAvailable: boolean;
  description?: string;
  createdAt: Date;
}

// ============================================
// Platform Settings
// ============================================

export interface PlatformSettings {
  general: {
    platformName: string;
    supportEmail: string;
  };
  registration: {
    isOpen: boolean;
    autoApprove: boolean;
  };
  maintenance: {
    isEnabled: boolean;
    message: string;
  };
}
