// ============================================
// Types & Interfaces - ouyaboung Platform
// Anti-gaspillage alimentaire - Gabon
// ============================================

// ============================================
// User Types
// ============================================
export interface User {
  id: string;
  email: string;
  phone?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'user' | 'merchant' | 'admin' | 'farmer';

export interface UserProfile extends User {
  address?: string;
  city?: string;
  quartier?: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  notifications_enabled: boolean;
  email_notifications: boolean;
  sms_notifications: boolean;
  favorite_categories: string[];
  max_distance_km: number;
  location_enabled?: boolean;
  default_radius_km?: number;
  last_known_location?: UserLocationPreference | null;
}

export interface UserLocationPreference {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  source?: string;
  is_approximate: boolean;
  city?: string | null;
  country?: string | null;
  region?: string | null;
  updated_at: string;
}

// ============================================
// Merchant Types
// ============================================
export interface Merchant {
  id: string;
  user_id: string;
  business_name: string;
  business_type: MerchantType;
  description?: string;
  logo_url?: string;
  cover_image_url?: string;
  address: string;
  city: string;
  quartier: string;
  latitude?: number | null;
  longitude?: number | null;
  phone: string;
  email: string;
  opening_hours?: OpeningHours;
  rating: number;
  total_reviews: number;
  is_verified: boolean;
  is_active: boolean;
  is_refused?: boolean;
  validated_at?: string;
  refused_at?: string;
  refusal_reason?: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export type MerchantType =
  | 'restaurant'
  | 'bakery'
  | 'grocery'
  | 'supermarket'
  | 'hotel'
  | 'caterer'
  | 'other';

export interface OpeningHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  open: string;
  close: string;
  is_closed: boolean;
}

// ============================================
// Farmer Types (répertoire des agriculteurs)
// ============================================
export interface Farmer {
  id: string;
  user_id: string;
  farm_name: string;
  farmer_type: FarmerType;
  description?: string;
  logo_url?: string;
  cover_image_url?: string;
  address: string;
  city: string;
  quartier: string;
  latitude?: number | null;
  longitude?: number | null;
  phone: string;
  email: string;
  rating: number;
  total_reviews: number;
  is_verified: boolean;
  is_active: boolean;
  is_refused?: boolean;
  validated_at?: string;
  refused_at?: string;
  refusal_reason?: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export type FarmerType = 'agriculture' | 'elevage' | 'peche' | 'mixte' | 'other';

// ============================================
// Farm Products Types (catalogue agricole)
// ============================================
export interface FarmProduct {
  id: string;
  farmer_id: string;
  farmer?: Farmer;
  name: string;
  description?: string;
  category: FarmProductCategory;
  unit: string; // ex: 'kg', 'sac', 'caisse', 'unite'
  price_per_unit: number; // in XAF
  quantity_available: number;
  available_from?: string;
  available_until?: string;
  image_url?: string;
  images?: string[];
  is_available: boolean;
  slug: string;
  created_at: string;
  updated_at: string;
}

export type FarmProductCategory =
  | 'tubercules'
  | 'legumes_feuilles'
  | 'fruits'
  | 'cereales'
  | 'elevage_volaille'
  | 'elevage_betail'
  | 'peche'
  | 'autre';

export interface CreateFarmProductInput {
  name: string;
  description?: string;
  category: FarmProductCategory;
  unit: string;
  price_per_unit: number;
  quantity_available: number;
  available_from?: string;
  available_until?: string;
  image_url?: string;
  images?: string[];
}

// ============================================
// Inventory / Food Items Types
// ============================================
export interface FoodItem {
  id: string;
  merchant_id: string;
  merchant?: Merchant;
  name: string;
  description?: string;
  category: FoodCategory;
  original_price: number; // in XAF
  discounted_price: number; // in XAF
  discount_percentage: number;
  quantity_available: number;
  quantity_initial: number;
  image_url?: string;
  images?: string[];
  pickup_start: string;
  pickup_end: string;
  expiry_date?: string;
  is_available: boolean;
  contents?: BasketItem[];
  badges?: string[];
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface BasketItem {
  id: string;
  name: string;
  category: FoodCategory;
  originalPrice: number;
  quantity: number;
  imagePreview?: string;
}

export type FoodCategory =
  | 'bread_pastry'
  | 'prepared_meals'
  | 'fruits_vegetables'
  | 'dairy'
  | 'meat_fish'
  | 'beverages'
  | 'snacks'
  | 'mixed_basket'
  | 'other';

export interface CreateFoodItemInput {
  name: string;
  description?: string;
  category: FoodCategory;
  original_price: number;
  discounted_price: number;
  quantity_available: number;
  pickup_start: string;
  pickup_end: string;
  expiry_date?: string;
  image_url?: string;
  contents?: BasketItem[];
}

// ============================================
// Order / Reservation Types
// ============================================
export interface Order {
  id: string;
  user_id: string;
  merchant_id: string;
  food_item_id: string;
  food_item?: FoodItem;
  merchant?: Merchant;
  user?: User;
  quantity: number;
  total_price: number; // in XAF
  original_total: number; // in XAF
  savings: number; // in XAF
  status: OrderStatus;
  pickup_code: string;
  tracking_code: string;
  pickup_time?: string;
  confirmed_at?: string;
  picked_up_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  rating?: number;
  review?: string;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'ready'
  | 'picked_up'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface CreateOrderInput {
  food_item_id: string;
  quantity: number;
}

// ============================================
// Farm Orders Types (marché B2B commerçant <-> agriculteur)
// ============================================
export interface FarmOrder {
  id: string;
  merchant_id: string;
  farmer_id: string;
  farm_product_id: string;
  farm_product?: FarmProduct;
  farmer?: Farmer;
  merchant?: Merchant;
  quantity: number;
  unit: string;
  price_per_unit: number; // in XAF
  total_price: number; // in XAF
  special_request?: string;
  requested_date?: string;
  status: FarmOrderStatus;
  confirmed_at?: string;
  refused_at?: string;
  refusal_reason?: string;
  ready_at?: string;
  delivered_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  created_at: string;
  updated_at: string;
}

export type FarmOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'refused'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export interface CreateFarmOrderInput {
  farm_product_id: string;
  quantity: number;
  special_request?: string;
  requested_date?: string;
}

// ============================================
// Pricing Types
// ============================================
export interface PricingRecommendation {
  food_item_id: string;
  original_price: number;
  recommended_price: number;
  discount_percentage: number;
  confidence_score: number;
  factors: PricingFactor[];
  created_at: string;
}

export interface PricingFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  description: string;
}

// ============================================
// Impact / Analytics Types
// ============================================
export interface ImpactStats {
  total_food_saved_kg: number;
  total_money_saved_xaf: number;
  total_co2_avoided_kg: number;
  total_meals_saved: number;
  total_orders: number;
  total_merchants: number;
  total_users: number;
}

export interface UserImpact {
  user_id: string;
  food_saved_kg: number;
  money_saved_xaf: number;
  co2_avoided_kg: number;
  orders_count: number;
  total_meals_saved?: number;
  favorite_merchants: string[];
}

export interface MerchantImpact {
  merchant_id: string;
  food_saved_kg: number;
  revenue_from_waste_xaf: number;
  co2_avoided_kg: number;
  orders_fulfilled: number;
  total_meals_saved?: number;
  average_rating: number;
  waste_reduction_rate: number;
}

// ============================================
// Geolocation Types (Gabon)
// ============================================
export interface GabonLocation {
  city: GabonCity;
  quartier: string;
  latitude: number;
  longitude: number;
}

export type GabonCity =
  | 'Libreville'
  | 'Port-Gentil'
  | 'Franceville'
  | 'Oyem'
  | 'Moanda'
  | 'Mouila'
  | 'Lambaréné'
  | 'Tchibanga'
  | 'Koulamoutou'
  | 'Makokou';

export interface SearchFilters {
  city?: GabonCity;
  quartier?: string;
  category?: FoodCategory;
  merchant_type?: MerchantType;
  min_price?: number;
  max_price?: number;
  max_distance_km?: number;
  user_latitude?: number;
  user_longitude?: number;
  pickup_today?: boolean;
  sort_by?: 'distance' | 'price' | 'discount' | 'rating';
}

// ============================================
// Notification Types
// ============================================
export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export type NotificationType =
  | 'order_confirmed'
  | 'order_ready'
  | 'order_cancelled'
  | 'new_food_nearby'
  | 'merchant_verified'
  | 'merchant_pending'
  | 'merchant_refused'
  | 'farmer_pending'
  | 'farmer_verified'
  | 'farmer_refused'
  | 'farm_order_pending'
  | 'farm_order_confirmed'
  | 'farm_order_refused'
  | 'farm_order_ready'
  | 'farm_order_delivered'
  | 'farm_order_cancelled'
  | 'promotion'
  | 'system';

// ============================================
// Auth Types
// ============================================
export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignUpData extends AuthCredentials {
  full_name?: string;
  phone?: string;
  role: UserRole;
  business_name?: string; // for merchants
  farm_name?: string; // for farmers
  metadata?: Record<string, any>; // For additional profile data
}

export interface AuthSession {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// ============================================
// API Response Types
// ============================================
export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  success: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}
