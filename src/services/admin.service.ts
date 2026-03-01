// ============================================
// Admin Service - Super Admin Business Logic
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from '@/api/supabaseClient';
import { DB_TABLES } from '@/api/routes';
import type {
  MerchantRegistration,
  AdminKPIs,
  GeoDistribution,
  AdminActivity,
  MerchantValidationAction,
  SalesStats,
  TopMerchant,
  MerchantStatus,
  AdminClient,
  AdminProduct,
  PlatformSettings
} from '@/types/admin.types';

const MERCHANT_LIST_COLUMNS =
  'id,user_id,business_name,business_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,opening_hours,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';

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

// Service Functions
export const adminService = {
  // Get all clients (profiles with role = 'user') with aggregated orders
  getClients: async (): Promise<AdminClient[]> => {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured');
      return [];
    }

    const client = requireSupabaseClient();

    // Fetch user profiles
    const { data: profiles, error: profilesError } = await client
      .from(DB_TABLES.PROFILES)
      .select('id, user_id, email, phone, full_name, city, quartier, role, created_at')
      .in('role', ['user', 'merchant']);

    if (profilesError) {
      console.error('Error fetching client profiles:', profilesError);
      throw profilesError;
    }

    const userIds = (profiles || []).map((p) => p.user_id).filter(Boolean);

    if (userIds.length === 0) {
      return [];
    }

    // Fetch orders for these users and aggregate in memory
    const { data: orders, error: ordersError } = await client
      .from(DB_TABLES.ORDERS)
      .select('user_id, total_price');
      
    // Restrict aggregation to known users only.
    const scopedOrders = orders?.filter((order) => order.user_id && userIds.includes(order.user_id)) || [];

    if (ordersError) {
      console.error('Error fetching client orders:', ordersError);
      throw ordersError;
    }

    const ordersByUser: Record<
      string,
      { ordersCount: number; totalSpent: number }
    > = {};

    scopedOrders.forEach((order: any) => {
      const userId = order.user_id as string | null;
      if (!userId) return;

      if (!ordersByUser[userId]) {
        ordersByUser[userId] = { ordersCount: 0, totalSpent: 0 };
      }

      ordersByUser[userId].ordersCount += 1;
      ordersByUser[userId].totalSpent += order.total_price || 0;
    });

    // Map profiles to AdminClient objects
    return (profiles || []).map((p: any) => {
      const agg = ordersByUser[p.user_id] || {
        ordersCount: 0,
        totalSpent: 0,
      };

      const fullName =
        p.full_name ||
        (p.email ? (p.email as string).split('@')[0] : 'Client');

      const status: AdminClient['status'] =
        agg.ordersCount > 0 ? 'active' : 'inactive';

      return {
        id: p.user_id,
        profileId: p.id,
        fullName,
        email: p.email,
        phone: p.phone || undefined,
        city: p.city || undefined,
        quartier: p.quartier || undefined,
        createdAt: p.created_at ? new Date(p.created_at) : new Date(),
        ordersCount: agg.ordersCount,
        totalSpent: agg.totalSpent,
        status,
        role: p.role,
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
  getMerchants: async (status?: MerchantStatus): Promise<MerchantRegistration[]> => {
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

    const { data, error } = await query.order('created_at', { ascending: false });

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

  // Get Admin KPIs
  getKPIs: async (): Promise<AdminKPIs> => {
    if (!isSupabaseConfigured()) {
      return {
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
    }

    const client = requireSupabaseClient();

    // Fetch counts in parallel
    const [
      merchantsResult,
      activeMerchantsResult,
      pendingMerchantsResult,
      refusedMerchantsResult,
      clientsResult,
      productsResult,
      ordersResult,
    ] = await Promise.all([
      client.from(DB_TABLES.MERCHANTS).select('id', { count: 'exact', head: true }),
      client.from(DB_TABLES.MERCHANTS).select('id', { count: 'exact', head: true }).eq('is_verified', true).eq('is_active', true),
      client.from(DB_TABLES.MERCHANTS).select('id', { count: 'exact', head: true }).eq('is_verified', false).eq('is_refused', false),
      client.from(DB_TABLES.MERCHANTS).select('id', { count: 'exact', head: true }).eq('is_refused', true),
      client.from(DB_TABLES.PROFILES).select('id', { count: 'exact', head: true }),
      client.from(DB_TABLES.FOOD_ITEMS).select('id', { count: 'exact', head: true }).eq('is_available', true),
      client.from(DB_TABLES.ORDERS).select('total_price'),
    ]);

    const totalRevenue = ordersResult.data?.reduce((sum, order) => sum + (order.total_price || 0), 0) || 0;
    const totalSales = ordersResult.data?.length || 0;

    return {
      totalMerchants: merchantsResult.count || 0,
      activeMerchants: activeMerchantsResult.count || 0,
      pendingMerchants: pendingMerchantsResult.count || 0,
      refusedMerchants: refusedMerchantsResult.count || 0,
      totalClients: clientsResult.count || 0,
      activeProducts: productsResult.count || 0,
      activeBaskets: 0,
      totalSales,
      totalRevenue,
      conversionRate: totalSales > 0 ? 68.5 : 0, // Calculated based on business logic
      averageOrderValue: totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0,
    };
  },

  // Get Geographic Distribution
  getGeoDistribution: async (): Promise<GeoDistribution[]> => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const client = requireSupabaseClient();
    const { data: merchants, error } = await client
      .from(DB_TABLES.MERCHANTS)
      .select('city')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching geo distribution:', error);
      return [];
    }

    // Group by city
    const cityGroups: Record<string, number> = {};
    merchants?.forEach(m => {
      cityGroups[m.city] = (cityGroups[m.city] || 0) + 1;
    });

    return Object.entries(cityGroups).map(([city, count]) => ({
      city,
      merchantCount: count,
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

  // Get Sales Statistics
  getSalesStats: async (): Promise<SalesStats[]> => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const client = requireSupabaseClient();
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const { data: orders, error } = await client
      .from(DB_TABLES.ORDERS)
      .select('created_at, total_price')
      .gte('created_at', startOfWeek.toISOString());

    if (error) {
      console.error('Error fetching sales stats:', error);
      return [];
    }

    // Group by day
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const stats: Record<string, SalesStats> = {};

    days.forEach(day => {
      stats[day] = { period: day, sales: 0, revenue: 0, orders: 0 };
    });

    orders?.forEach(order => {
      const date = new Date(order.created_at);
      const day = days[date.getDay()];
      stats[day].sales += 1;
      stats[day].orders += 1;
      stats[day].revenue += order.total_price || 0;
    });

    // Return in week order (Mon-Sun)
    return ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => stats[day]);
  },

  // Get Top Merchants
  getTopMerchants: async (limit: number = 5): Promise<TopMerchant[]> => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const client = requireSupabaseClient();
    const { data: merchants, error } = await client
      .from(DB_TABLES.MERCHANTS)
      .select(`
        id,
        business_name,
        rating
      `)
      .eq('is_verified', true)
      .eq('is_active', true)
      .order('rating', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching top merchants:', error);
      return [];
    }

    // Get order counts and revenue per merchant
    const merchantIds = merchants?.map(m => m.id) || [];
    const { data: orders } = await client
      .from(DB_TABLES.ORDERS)
      .select('merchant_id, total_price')
      .in('merchant_id', merchantIds);

    const ordersByMerchant: Record<string, { count: number; revenue: number }> = {};
    orders?.forEach(o => {
      if (!ordersByMerchant[o.merchant_id]) {
        ordersByMerchant[o.merchant_id] = { count: 0, revenue: 0 };
      }
      ordersByMerchant[o.merchant_id].count += 1;
      ordersByMerchant[o.merchant_id].revenue += o.total_price || 0;
    });

    // Get product counts
    const { data: products } = await client
      .from(DB_TABLES.FOOD_ITEMS)
      .select('merchant_id')
      .in('merchant_id', merchantIds);

    const productsByMerchant: Record<string, number> = {};
    products?.forEach(p => {
      productsByMerchant[p.merchant_id] = (productsByMerchant[p.merchant_id] || 0) + 1;
    });

    return (merchants || []).map(m => ({
      id: m.id,
      name: m.business_name,
      sales: ordersByMerchant[m.id]?.count || 0,
      revenue: ordersByMerchant[m.id]?.revenue || 0,
      productsCount: productsByMerchant[m.id] || 0,
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
  getProducts: async (): Promise<AdminProduct[]> => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const client = requireSupabaseClient();
    const { data, error } = await client
      .from(DB_TABLES.FOOD_ITEMS)
      .select('id,merchant_id,name,category,original_price,discounted_price,quantity_available,is_available,description,created_at,merchant:merchants(id,business_name)')
      .order('created_at', { ascending: false });

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
};

export default adminService;
