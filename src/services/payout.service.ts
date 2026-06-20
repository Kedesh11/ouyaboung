import { requireSupabaseClient } from '@/api/supabaseClient';
import type { ApiResponse } from '@/types';
import {
  getAirtelPhoneError,
  getMoovPhoneError,
  normalizePhone,
} from '@/lib/phone-validation';

export type PayoutOperator = 'airtel' | 'moov';

export interface MerchantPayoutAccount {
  id: string;
  merchant_id: string;
  provider: 'singpay';
  operator: PayoutOperator;
  label: string;
  msisdn: string;
  normalized_msisdn: string;
  disbursement_id: string | null;
  verification_status: 'pending' | 'verified' | 'rejected' | 'disabled';
  rejection_reason: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMerchantPayoutInput {
  merchantId: string;
  operator: PayoutOperator;
  label: string;
  msisdn: string;
  isDefault?: boolean;
}

const validatePayoutPhone = (operator: PayoutOperator, phone: string): string | null => {
  return operator === 'airtel'
    ? getAirtelPhoneError(phone)
    : getMoovPhoneError(phone);
};

export const getMerchantPayoutAccounts = async (
  merchantId: string
): Promise<ApiResponse<MerchantPayoutAccount[]>> => {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from('merchant_payout_accounts')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('provider', 'singpay')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: (data || []) as MerchantPayoutAccount[],
    error: null,
    success: true,
  };
};

export const createMerchantPayoutAccount = async (
  input: CreateMerchantPayoutInput
): Promise<ApiResponse<MerchantPayoutAccount>> => {
  const phoneError = validatePayoutPhone(input.operator, input.msisdn);
  if (phoneError) {
    return {
      data: null,
      error: { code: 'INVALID_PHONE', message: phoneError },
      success: false,
    };
  }

  const normalizedPhone = normalizePhone(input.msisdn);
  if (!normalizedPhone) {
    return {
      data: null,
      error: { code: 'PHONE_NORMALIZATION_ERROR', message: 'Numero Mobile Money invalide.' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from('merchant_payout_accounts')
    .insert({
      merchant_id: input.merchantId,
      provider: 'singpay',
      operator: input.operator,
      label: input.label.trim() || (input.operator === 'airtel' ? 'Airtel Money' : 'Libertis/Moov Money'),
      msisdn: input.msisdn.trim(),
      normalized_msisdn: normalizedPhone,
      verification_status: 'pending',
      is_default: input.isDefault ?? false,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as MerchantPayoutAccount,
    error: null,
    success: true,
  };
};
