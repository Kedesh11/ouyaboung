import { requireSupabaseClient, isSupabaseConfigured } from '@/api/supabaseClient';
import type { ApiResponse } from '@/types';
import { getSupabasePublicEnv } from '@/lib/supabase/public-env';

const USER_TRANSACTION_COLUMNS = [
  'transaction_id',
  'transaction_date',
  'payment_status',
  'q_gabon_reference',
  'provider_reference',
  'provider',
  'base_amount',
  'airtel_fees',
  'pvit_fees',
  'app_fees',
  'total_amount',
  'merchant_revenue',
  'q_gabon_fees',
  'payment_phone_number',
  'operator_owner_charge',
  'q_gabon_transaction_id',
  'merchant_reference_id',
  'operator',
  'operator_fees',
  'status_code',
  'message',
  'provider_transaction_id',
  'provider_status',
  'provider_result',
  'platform_commission',
  'settlement_status',
  'disbursement_id',
  'provider_transfer_reference',
  'provider_transfer_status',
  'product_name',
  'merchant_name',
  'customer_phone',
  'order_status',
].join(',');

const MERCHANT_TRANSACTION_COLUMNS = [
  'transaction_id',
  'transaction_date',
  'payment_status',
  'q_gabon_reference',
  'provider_reference',
  'provider',
  'base_amount',
  'airtel_fees',
  'pvit_fees',
  'app_fees',
  'total_amount',
  'merchant_revenue',
  'q_gabon_fees',
  'payment_phone_number',
  'operator_owner_charge',
  'q_gabon_transaction_id',
  'merchant_reference_id',
  'operator',
  'operator_fees',
  'status_code',
  'message',
  'provider_transaction_id',
  'provider_status',
  'provider_result',
  'platform_commission',
  'settlement_status',
  'disbursement_id',
  'provider_transfer_reference',
  'provider_transfer_status',
  'product_name',
  'customer_name',
  'customer_phone',
  'order_status',
].join(',');

export type PaymentTransactionRecord = Record<string, unknown>;

const getFunctionUrl = (name: string): string | null => {
  const { url } = getSupabasePublicEnv();
  if (!url) return null;
  return `${url.replace(/\/$/, '')}/functions/v1/${name}`;
};

const getAuthenticatedUserId = async (): Promise<ApiResponse<string>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();

  if (error || !user) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Non authentifié' },
      success: false,
    };
  }

  return { data: user.id, error: null, success: true };
};

export const getUserPaymentTransactions = async (
  limit = 500
): Promise<ApiResponse<PaymentTransactionRecord[]>> => {
  const auth = await getAuthenticatedUserId();
  if (!auth.success || !auth.data) return { data: null, error: auth.error, success: false };

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from('merchant_transactions')
    .select(USER_TRANSACTION_COLUMNS)
    .eq('customer_id', auth.data)
    .order('transaction_date', { ascending: false })
    .range(0, limit - 1);

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return { data: (data || []) as unknown as PaymentTransactionRecord[], error: null, success: true };
};

export const getMerchantPaymentTransactions = async (
  limit = 500
): Promise<ApiResponse<PaymentTransactionRecord[]>> => {
  const auth = await getAuthenticatedUserId();
  if (!auth.success || !auth.data) return { data: null, error: auth.error, success: false };

  const client = requireSupabaseClient();
  const { data: merchant, error: merchantError } = await client
    .from('merchants')
    .select('id')
    .eq('user_id', auth.data)
    .maybeSingle();

  if (merchantError || !merchant?.id) {
    return {
      data: null,
      error: { code: 'MERCHANT_NOT_FOUND', message: 'Profil marchand introuvable' },
      success: false,
    };
  }

  const { data, error } = await client
    .from('merchant_transactions')
    .select(MERCHANT_TRANSACTION_COLUMNS)
    .eq('merchant_id', merchant.id)
    .order('transaction_date', { ascending: false })
    .range(0, limit - 1);

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return { data: (data || []) as unknown as PaymentTransactionRecord[], error: null, success: true };
};

export const getAdminPaymentTransactions = async (
  limit = 500
): Promise<ApiResponse<PaymentTransactionRecord[]>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from('merchant_transactions')
    .select('*')
    .order('transaction_date', { ascending: false })
    .range(0, limit - 1);

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return { data: (data || []) as PaymentTransactionRecord[], error: null, success: true };
};

export const syncSingPayTransactionStatus = async (
  params: { reference?: string; transactionId?: string }
): Promise<ApiResponse<unknown>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const functionUrl = getFunctionUrl('singpay-transaction-sync');
  if (!functionUrl) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: "URL d'Edge Function non configuree" },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
      success: false,
    };
  }

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(params),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    return {
      data: null,
      error: {
        code: payload?.error?.code || 'SINGPAY_SYNC_FAILED',
        message: payload?.error?.message || payload?.error || 'Synchronisation SingPay impossible',
        details: payload,
      },
      success: false,
    };
  }

  return {
    data: payload.data,
    error: null,
    success: true,
  };
};
