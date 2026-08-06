import { cache } from 'react';
import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { isMerchantPubliclyAvailable, isFarmerPubliclyAvailable } from '@/lib/data/public.utils';
import type { FoodItem, Merchant, Farmer, FarmProduct } from '@/types';

const MERCHANT_LIST_COLUMNS =
  'id,user_id,business_name,business_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,opening_hours,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';
const FOOD_ITEM_LIST_COLUMNS =
  'id,merchant_id,name,description,category,original_price,discounted_price,discount_percentage,quantity_available,quantity_initial,image_url,images,pickup_start,pickup_end,expiry_date,is_available,contents,badges,slug,created_at,updated_at';
const FARMER_LIST_COLUMNS =
  'id,user_id,farm_name,farmer_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';
const FARM_PRODUCT_LIST_COLUMNS =
  'id,farmer_id,name,description,category,unit,price_per_unit,quantity_available,available_from,available_until,image_url,images,is_available,slug,created_at,updated_at';

const toOne = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

export const fetchProductBySlug = async (slug: string): Promise<FoodItem | null> => {
  const client = createPublicSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('food_items')
    .select(`${FOOD_ITEM_LIST_COLUMNS}, merchants(${MERCHANT_LIST_COLUMNS})`)
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;

  const product = {
    ...data,
    merchant: toOne(data.merchants),
  } as FoodItem;

  if (!isMerchantPubliclyAvailable(product.merchant)) {
    return null;
  }

  return product;
};

export const fetchMerchantBySlug = async (slug: string): Promise<Merchant | null> => {
  const client = createPublicSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('merchants')
    .select(MERCHANT_LIST_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  if (!isMerchantPubliclyAvailable(data as Merchant)) return null;

  return data as Merchant;
};

export const fetchMerchantItems = async (merchantId: string): Promise<FoodItem[]> => {
  const client = createPublicSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('food_items')
    .select(FOOD_ITEM_LIST_COLUMNS)
    .eq('merchant_id', merchantId)
    .eq('is_available', true)
    .gt('quantity_available', 0)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as FoodItem[];
};

export const fetchFarmerBySlug = async (slug: string): Promise<Farmer | null> => {
  const client = createPublicSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('farmers')
    .select(FARMER_LIST_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  if (!isFarmerPubliclyAvailable(data as Farmer)) return null;

  return data as Farmer;
};

export const fetchFarmerProducts = async (farmerId: string): Promise<FarmProduct[]> => {
  const client = createPublicSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('farm_products')
    .select(FARM_PRODUCT_LIST_COLUMNS)
    .eq('farmer_id', farmerId)
    .eq('is_available', true)
    .gt('quantity_available', 0)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as FarmProduct[];
};

export const getCachedProductBySlug = cache(fetchProductBySlug);
export const getCachedMerchantBySlug = cache(fetchMerchantBySlug);
export const getCachedFarmerBySlug = cache(fetchFarmerBySlug);
