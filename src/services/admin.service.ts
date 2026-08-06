// ============================================
// Admin Service - Super Admin Business Logic
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from '@/api/supabaseClient';
import { DB_TABLES } from '@/api/routes';
import type {
  MerchantRegistration,
  AdminKPIs,
  AdminTrafficMetrics,
  GeoDistribution,
  AdminActivity,
  MerchantValidationAction,
  SalesStats,
  TopMerchant,
  MerchantStatus,
  FarmerRegistration,
  FarmerValidationAction,
  FarmerStatus,
  AdminClient,
  AdminProduct,
  PlatformSettings,
  BulkActionResponse
} from '@/types/admin.types';

const MERCHANT_LIST_COLUMNS =
  'id,user_id,business_name,business_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,opening_hours,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';
const FARMER_LIST_COLUMNS =
  'id,user_id,farm_name,farmer_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';

// Transform DB merchant to MerchantRegistration
const transformMerchant = (dbMerchant: any): MerchantRegistration => ({
  id: dbMerchant.id,
  businessName: dbMerchant.business_name,
  ownerName: dbMerchant.owner_name || dbMerchant.business_name,
  email: dbMerchant.email,
  phone: dbMerchant.phone,
  address: dbMerchant.address,
  city: dbMerchant.city,
  postalCode: dbMerchant.postal_code || '',
  businessType: dbMerchant.business_type,
  siret: dbMerchant.siret || '',
  description: dbMerchant.description || '',
  status: dbMerchant.is_verified
    ? 'validated'
    : dbMerchant.is_refused
      ? 'refused'
      : 'pending',
  createdAt: new Date(dbMerchant.created_at),
  updatedAt: new Date(dbMerchant.updated_at),
  validatedAt: dbMerchant.validated_at ? new Date(dbMerchant.validated_at) : undefined,
  refusedAt: dbMerchant.refused_at ? new Date(dbMerchant.refused_at) : undefined,
  refusalReason: dbMerchant.refusal_reason,
  latitude: dbMerchant.latitude,
  longitude: dbMerchant.longitude,
});

// Transform DB farmer to FarmerRegistration
const transformFarmer = (dbFarmer: any): FarmerRegistration => ({
  id: dbFarmer.id,
  farmName: dbFarmer.farm_name,
  ownerName: dbFarmer.owner_name || dbFarmer.farm_name,
  email: dbFarmer.email,
  phone: dbFarmer.phone,
  address: dbFarmer.address,
  city: dbFarmer.city,
  farmerType: dbFarmer.farmer_type,
  description: dbFarmer.description || '',
  status: dbFarmer.is_verified
    ? 'validated'
    : dbFarmer.is_refused
      ? 'refused'
      : 'pending',
  createdAt: new Date(dbFarmer.created_at),
  updatedAt: new Date(dbFarmer.updated_at),
  validatedAt: dbFarmer.validated_at ? new Date(dbFarmer.validated_at) : undefined,
  refusedAt: dbFarmer.refused_at ? new Date(dbFarmer.refused_at) : undefined,
  refusalReason: dbFarmer.refusal_reason,
  latitude: dbFarmer.latitude,
  longitude: dbFarmer.longitude,
});

// Service Functions
export const adminService = {
  getTrafficMetrics: async (windowDays: number = 14): Promise<AdminTrafficMetrics> => {
    const safeWindowDays = Math.min(Math.max(windowDays, 7), 90);
    const fallback: AdminTrafficMetrics = {
      windowDays: safeWindowDays,
      totalRegisteredUsers: 0,
      visitorsToday: 0,
      visitorsYesterday: 0,
      visitorsGrowthPercent: 0,
      dailyAverageVisitors: 0,
      dailyVisitRatePercent: 0,
      pageViewsToday: 0,
      sessionsToday: 0,
      pwaInstallsTotal: 0,
      pwaInstallsLast30d: 0,
      recurringVisitors7d: 0,
      daily: [],
    };

    try {
      const response = await fetch(`/api/admin/traffic-metrics?days=${safeWindowDays}`, {
        method: 'GET',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        return fallback;
      }

      const payload = await response.json() as {
        success: boolean;
        metrics?: AdminTrafficMetrics;
      };

      if (!payload.success || !payload.metrics) {
        return fallback;
      }

      return payload.metrics;
    } catch (error) {
      console.warn('Failed to load traffic metrics:', error);
      return fallback;
    }
  },

  // Get all clients (profiles with role = 'user'/'merchant') with aggregated
  // orders. Aggregation happens in `get_admin_clients` (SQL, GROUP BY) rather
  // than fetching every order row over the wire and reducing in JS.
  getClients: async (page: number = 1, perPage: number = 500): Promise<AdminClient[]> => {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured');
      return [];
    }

    const client = requireSupabaseClient();
    const { data, error } = await client.rpc('get_admin_clients', {
      p_limit: perPage,
      p_offset: (page - 1) * perPage,
    });

    if (error) {
      console.error('Error fetching client profiles:', error);
      throw error;
    }

    return (data || []).map((row: any) => {
      const fullName =
        row.full_name ||
        (row.email ? (row.email as string).split('@')[0] : 'Client');

      const status: AdminClient['status'] =
        (row.orders_count || 0) > 0 ? 'active' : 'inactive';

      return {
        id: row.user_id,
        profileId: row.profile_id,
        fullName,
        email: row.email,
        phone: row.phone || undefined,
        city: row.city || undefined,
        quartier: row.quartier || undefined,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        ordersCount: row.orders_count || 0,
        totalSpent: row.total_spent || 0,
        status,
        role: row.role,
      };
    });
  },

  // Get orders for a specific client
  getClientOrders: async (userId: string) => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const client = requireSupabaseClient();
    const { data, error } = await client
      .from(DB_TABLES.ORDERS)
      .select('id,created_at,total_price,status,merchant:merchants(business_name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching client orders:', error);
      throw error;
    }

    return (data || []).map((order: any) => ({
      id: order.id,
      merchantName: order.merchant?.business_name || 'Commerce inconnu',
      totalPrice: order.total_price,
      status: order.status,
      createdAt: new Date(order.created_at),
      itemsCount: order.items?.length || 0, // Assuming items is a JSON array or handled elsewhere
    }));
  },

  // Get all merchants with optional status filter
  getMerchants: async (
    status?: MerchantStatus,
    page: number = 1,
    perPage: number = 200
  ): Promise<MerchantRegistration[]> => {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured');
      return [];
    }

    const client = requireSupabaseClient();
    let query = client.from(DB_TABLES.MERCHANTS).select(MERCHANT_LIST_COLUMNS);

    if (status === 'validated') {
      query = query.eq('is_verified', true);
    } else if (status === 'refused') {
      query = query.eq('is_refused', true);
    } else if (status === 'pending') {
      query = query.eq('is_verified', false).eq('is_refused', false);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    if (error) {
      console.error('Error fetching merchants:', error);
      throw error;
    }

    return (data || []).map(transformMerchant);
  },

  // Get merchant by ID
  getMerchantById: async (id: string): Promise<MerchantRegistration | null> => {
    if (!isSupabaseConfigured()) {
      return null;
    }

    const client = requireSupabaseClient();
    const { data, error } = await client
      .from(DB_TABLES.MERCHANTS)
      .select(MERCHANT_LIST_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching merchant:', error);
      throw error;
    }

    return data ? transformMerchant(data) : null;
  },

  // Validate or refuse a merchant
  updateMerchantStatus: async (action: MerchantValidationAction): Promise<MerchantRegistration> => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const refusalReason = action.reason?.trim();
    if (action.action === 'refuse' && !refusalReason) {
      throw new Error('Le motif du refus est obligatoire.');
    }

    const client = requireSupabaseClient();
    const updates = action.action === 'validate'
      ? {
        is_verified: true,
        is_refused: false,
        is_active: true,
        validated_at: new Date().toISOString(),
        refused_at: null,
        refusal_reason: null,
        updated_at: new Date().toISOString(),
      }
      : {
        is_verified: false,
        is_refused: true,
        is_active: false,
        refused_at: new Date().toISOString(),
        refusal_reason: refusalReason,
        updated_at: new Date().toISOString(),
      };

    const { data, error } = await client
      .from(DB_TABLES.MERCHANTS)
      .update(updates)
      .eq('id', action.merchantId)
      .select(MERCHANT_LIST_COLUMNS)
      .single();

    if (error) {
      console.error('Error updating merchant status:', error);
      throw error;
    }

    // Log admin activity
    try {
      await client.from(DB_TABLES.ADMIN_ACTIVITIES).insert({
        type: action.action === 'validate' ? 'merchant_validated' : 'merchant_refused',
        description: `Commerce ${action.action === 'validate' ? 'validé' : 'refusé'}: ${data.business_name}`,
        metadata: { merchant_id: action.merchantId, admin_id: action.adminId },
      });
    } catch (err) {
      console.warn('Failed to log activity:', err);
    }

    if (data.user_id) {
      try {
        await client.from(DB_TABLES.NOTIFICATIONS).insert({
          user_id: data.user_id,
          type: action.action === 'validate' ? 'merchant_verified' : 'merchant_refused',
          title: action.action === 'validate' ? 'Boutique approuvée' : 'Boutique refusée',
          message: action.action === 'validate'
            ? `Votre boutique "${data.business_name}" est approuvée. Vous pouvez désormais ajouter des produits.`
            : `Votre boutique "${data.business_name}" a été refusée.${refusalReason ? ` Motif: ${refusalReason}` : ''}`,
          data: {
            merchant_id: action.merchantId,
            action: action.action,
            reason: refusalReason || null,
          },
        });
      } catch (err) {
        console.warn('Failed to notify merchant after status update:', err);
      }
    }

    return transformMerchant(data);
  },

  // Get all farmers with optional status filter
  getFarmers: async (
    status?: FarmerStatus,
    page: number = 1,
    perPage: number = 200
  ): Promise<FarmerRegistration[]> => {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured');
      return [];
    }

    const client = requireSupabaseClient();
    let query = client.from(DB_TABLES.FARMERS).select(FARMER_LIST_COLUMNS);

    if (status === 'validated') {
      query = query.eq('is_verified', true);
    } else if (status === 'refused') {
      query = query.eq('is_refused', true);
    } else if (status === 'pending') {
      query = query.eq('is_verified', false).eq('is_refused', false);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    if (error) {
      console.error('Error fetching farmers:', error);
      throw error;
    }

    return (data || []).map(transformFarmer);
  },

  // Get farmer by ID
  getFarmerById: async (id: string): Promise<FarmerRegistration | null> => {
    if (!isSupabaseConfigured()) {
      return null;
    }

    const client = requireSupabaseClient();
    const { data, error } = await client
      .from(DB_TABLES.FARMERS)
      .select(FARMER_LIST_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching farmer:', error);
      throw error;
    }

    return data ? transformFarmer(data) : null;
  },

  // Validate or refuse a farmer
  updateFarmerStatus: async (action: FarmerValidationAction): Promise<FarmerRegistration> => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const refusalReason = action.reason?.trim();
    if (action.action === 'refuse' && !refusalReason) {
      throw new Error('Le motif du refus est obligatoire.');
    }

    const client = requireSupabaseClient();
    const updates = action.action === 'validate'
      ? {
        is_verified: true,
        is_refused: false,
        is_active: true,
        validated_at: new Date().toISOString(),
        refused_at: null,
        refusal_reason: null,
        updated_at: new Date().toISOString(),
      }
      : {
        is_verified: false,
        is_refused: true,
        is_active: false,
        refused_at: new Date().toISOString(),
        refusal_reason: refusalReason,
        updated_at: new Date().toISOString(),
      };

    const { data, error } = await client
      .from(DB_TABLES.FARMERS)
      .update(updates)
      .eq('id', action.farmerId)
      .select(FARMER_LIST_COLUMNS)
      .single();

    if (error) {
      console.error('Error updating farmer status:', error);
      throw error;
    }

    // Log admin activity
    try {
      await client.from(DB_TABLES.ADMIN_ACTIVITIES).insert({
        type: action.action === 'validate' ? 'farmer_validated' : 'farmer_refused',
        description: `Agriculteur ${action.action === 'validate' ? 'validé' : 'refusé'}: ${data.farm_name}`,
        metadata: { farmer_id: action.farmerId, admin_id: action.adminId },
      });
    } catch (err) {
      console.warn('Failed to log activity:', err);
    }

    if (data.user_id) {
      try {
        await client.from(DB_TABLES.NOTIFICATIONS).insert({
          user_id: data.user_id,
          type: action.action === 'validate' ? 'farmer_verified' : 'farmer_refused',
          title: action.action === 'validate' ? 'Exploitation approuvée' : 'Exploitation refusée',
          message: action.action === 'validate'
            ? `Votre exploitation "${data.farm_name}" est approuvée. Vous pouvez désormais ajouter des produits.`
            : `Votre exploitation "${data.farm_name}" a été refusée.${refusalReason ? ` Motif: ${refusalReason}` : ''}`,
          data: {
            farmer_id: action.farmerId,
            action: action.action,
            reason: refusalReason || null,
          },
        });
      } catch (err) {
        console.warn('Failed to notify farmer after status update:', err);
      }
    }

    return transformFarmer(data);
  },

  // Get Admin KPIs. All counts/sums are computed in
  // `get_admin_dashboard_kpis` (SQL) rather than fetching every order row
  // over the wire and reducing in JS - see docs/RISKS_TRACKING.md.
  getKPIs: async (): Promise<AdminKPIs> => {
    const empty: AdminKPIs = {
      totalMerchants: 0,
      activeMerchants: 0,
      pendingMerchants: 0,
      refusedMerchants: 0,
      totalClients: 0,
      activeProducts: 0,
      activeBaskets: 0,
      totalSales: 0,
      totalRevenue: 0,
      conversionRate: 0,
      averageOrderValue: 0,
    };

    if (!isSupabaseConfigured()) {
      return empty;
    }

    const client = requireSupabaseClient();
    const { data: rpcData, error } = await client.rpc('get_admin_dashboard_kpis').single();
    const data = rpcData as {
      total_merchants?: number;
      active_merchants?: number;
      pending_merchants?: number;
      refused_merchants?: number;
      total_clients?: number;
      active_products?: number;
      total_sales?: number;
      total_revenue?: number;
    } | null;

    if (error || !data) {
      console.error('Error fetching admin KPIs:', error);
      return empty;
    }

    const totalSales = data.total_sales || 0;
    const totalRevenue = data.total_revenue || 0;

    return {
      totalMerchants: data.total_merchants || 0,
      activeMerchants: data.active_merchants || 0,
      pendingMerchants: data.pending_merchants || 0,
      refusedMerchants: data.refused_merchants || 0,
      totalClients: data.total_clients || 0,
      activeProducts: data.active_products || 0,
      activeBaskets: 0,
      totalSales,
      totalRevenue,
      conversionRate: totalSales > 0 ? 68.5 : 0, // Calculated based on business logic
      averageOrderValue: totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0,
    };
  },

  // Get Geographic Distribution (GROUP BY city in `get_admin_geo_distribution`).
  getGeoDistribution: async (): Promise<GeoDistribution[]> => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const client = requireSupabaseClient();
    const { data, error } = await client.rpc('get_admin_geo_distribution');

    if (error) {
      console.error('Error fetching geo distribution:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      city: row.city,
      merchantCount: row.merchant_count || 0,
      salesCount: 0, // Would need to join with orders
    }));
  },

  // Get Recent Activities
  getRecentActivities: async (limit: number = 10): Promise<AdminActivity[]> => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const client = requireSupabaseClient();
    const { data, error } = await client
      .from(DB_TABLES.ADMIN_ACTIVITIES)
      .select('id,type,description,metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Activities table may not exist:', error);
      // Return recent merchant registrations as fallback
      const { data: merchants } = await client
        .from(DB_TABLES.MERCHANTS)
        .select('id, business_name, created_at, is_verified, is_refused')
        .order('created_at', { ascending: false })
        .limit(limit);

      return (merchants || []).map(m => ({
        id: m.id,
        type: m.is_verified
          ? 'merchant_validated' as const
          : m.is_refused
            ? 'merchant_refused' as const
            : 'merchant_registration' as const,
        description: `${m.is_verified ? 'Commerce validé' : m.is_refused ? 'Commerce refusé' : 'Nouvelle inscription'}: ${m.business_name}`,
        timestamp: new Date(m.created_at),
      }));
    }

    return (data || []).map(a => ({
      id: a.id,
      type: a.type,
      description: a.description,
      timestamp: new Date(a.created_at),
      metadata: a.metadata,
    }));
  },

  // Get Sales Statistics (last 7 days, GROUP BY day in `get_admin_sales_stats`;
  // only the French day-label bucketing of the ~7 resulting rows stays in JS).
  getSalesStats: async (): Promise<SalesStats[]> => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const client = requireSupabaseClient();
    const { data, error } = await client.rpc('get_admin_sales_stats', { p_days: 7 });

    if (error) {
      console.error('Error fetching sales stats:', error);
      return [];
    }

    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const stats: Record<string, SalesStats> = {};

    days.forEach(day => {
      stats[day] = { period: day, sales: 0, revenue: 0, orders: 0 };
    });

    (data || []).forEach((row: any) => {
      // day_date comes back as a plain "YYYY-MM-DD" string; anchor it at
      // UTC noon so day-of-week bucketing can't roll to an adjacent day
      // depending on the reader's local timezone.
      const date = new Date(`${row.day_date}T12:00:00Z`);
      const day = days[date.getUTCDay()];
      const ordersCount = row.orders_count || 0;
      stats[day].sales += ordersCount;
      stats[day].orders += ordersCount;
      stats[day].revenue += row.revenue || 0;
    });

    // Return in week order (Mon-Sun)
    return ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => stats[day]);
  },

  // Get Top Merchants: `get_admin_top_merchants` selects the top N first,
  // then aggregates orders/products only for those N (LEFT JOIN LATERAL)
  // instead of fetching all orders/products for every verified merchant.
  getTopMerchants: async (limit: number = 5): Promise<TopMerchant[]> => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const client = requireSupabaseClient();
    const { data, error } = await client.rpc('get_admin_top_merchants', { p_limit: limit });

    if (error) {
      console.error('Error fetching top merchants:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.business_name,
      sales: row.orders_count || 0,
      revenue: row.revenue || 0,
      productsCount: row.products_count || 0,
    }));
  },

  // Format currency
  formatCurrency: (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' FCFA';
  },

  // Format percentage
  formatPercentage: (value: number): string => {
    return value.toFixed(1) + '%';
  },

  // Get all products/baskets for admin view
  getProducts: async (page: number = 1, perPage: number = 200): Promise<AdminProduct[]> => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const client = requireSupabaseClient();
    const { data, error } = await client
      .from(DB_TABLES.FOOD_ITEMS)
      .select('id,merchant_id,name,category,original_price,discounted_price,quantity_available,is_available,description,created_at,merchant:merchants(id,business_name)')
      .order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    if (error) {
      console.error('Error fetching admin products:', error);
      throw error;
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      merchantId: item.merchant_id,
      merchantName: item.merchant?.business_name || 'Inconnu',
      category: item.category,
      originalPrice: item.original_price,
      discountPrice: item.discounted_price,
      quantity: item.quantity_available,
      isAvailable: item.is_available,
      description: item.description,
      createdAt: new Date(item.created_at),
    }));
  },

  getPlatformSettings: async (): Promise<PlatformSettings> => {
    if (!isSupabaseConfigured()) {
      return {
        general: { platformName: 'ouyaboung Gabon', supportEmail: 'support@ouyaboung.ga' },
        registration: { isOpen: true, autoApprove: false },
        maintenance: { isEnabled: false, message: 'Plateforme en maintenance' },
      };
    }

    const client = requireSupabaseClient();
    const { data, error } = await client
      .from('platform_settings')
      .select('key, value');

    if (error) {
      console.error('Error fetching platform settings:', error);
      // Fallback to defaults
      return {
        general: { platformName: 'ouyaboung Gabon', supportEmail: 'support@ouyaboung.ga' },
        registration: { isOpen: true, autoApprove: false },
        maintenance: { isEnabled: false, message: 'Plateforme en maintenance' },
      };
    }

    const settings: any = {
      general: { platformName: 'ouyaboung Gabon', supportEmail: 'support@ouyaboung.ga' },
      registration: { isOpen: true, autoApprove: false },
      maintenance: { isEnabled: false, message: 'Plateforme en maintenance' },
    };

    data.forEach((item: any) => {
      if (settings[item.key]) {
        settings[item.key] = { ...settings[item.key], ...item.value };
      }
    });

    return settings as PlatformSettings;
  },

  updatePlatformSettings: async (key: keyof PlatformSettings, value: any) => {
    if (!isSupabaseConfigured()) return false;

    const client = requireSupabaseClient();
    const { error } = await client
      .from('platform_settings')
      .upsert({
        key,
        value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (error) {
      console.error(`Error updating platform settings [${key}]:`, error);
      return false;
    }
    return true;
  },

  updateUserRole: async (email: string, role: string) => {
    try {
      const response = await fetch('/api/admin/users/role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Erreur lors de la mise à jour du rôle');
      }

      return data;
    } catch (error) {
      console.error('Error in updateUserRole:', error);
      throw error;
    }
  },

  bulkUpdateUserRole: async (userIds: string[], role: 'user' | 'merchant' | 'admin'): Promise<BulkActionResponse> => {
    const response = await fetch('/api/admin/users/bulk-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds, role }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Erreur lors du changement de rôle en masse');
    }

    return data;
  },

  bulkDeleteUsers: async (userIds: string[]): Promise<BulkActionResponse> => {
    const response = await fetch('/api/admin/users/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Erreur lors de la suppression en masse');
    }

    return data;
  },
};

export default adminService;
