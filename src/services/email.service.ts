// ============================================
// Email Service - Client-safe Email Triggers
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import {
  APP_URL,
  buildMerchantActionUrl,
  buildFarmerActionUrl,
  type MerchantEmailType,
  type FarmerEmailType,
  type DriverEmailType,
} from './email.shared';

const INTERNAL_EMAIL_ENDPOINT = '/api/admin/merchant-email';
const INTERNAL_FARMER_EMAIL_ENDPOINT = '/api/admin/farmer-email';
const INTERNAL_DRIVER_EMAIL_ENDPOINT = '/api/admin/driver-email';

interface MerchantEmailApiPayload {
  type: MerchantEmailType;
  email: string;
  businessName: string;
  reason?: string;
}

interface FarmerEmailApiPayload {
  type: FarmerEmailType;
  email: string;
  farmName: string;
  reason?: string;
}

interface DriverEmailApiPayload {
  type: DriverEmailType;
  email: string;
  driverName: string;
  reason?: string;
}

const sendViaInternalApi = async (
  endpoint: string,
  payload: MerchantEmailApiPayload | FarmerEmailApiPayload | DriverEmailApiPayload
): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.success) {
      return {
        success: false,
        error: data?.error || 'Email send failed',
      };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Network error' };
  }
};

export const sendMerchantApprovalEmail = async (
  email: string,
  businessName: string
): Promise<{ success: boolean; error?: string }> => {
  return sendViaInternalApi(INTERNAL_EMAIL_ENDPOINT, { type: 'approval', email, businessName });
};

export const sendMerchantRejectionEmail = async (
  email: string,
  businessName: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> => {
  return sendViaInternalApi(INTERNAL_EMAIL_ENDPOINT, { type: 'rejection', email, businessName, reason });
};

export const sendFarmerApprovalEmail = async (
  email: string,
  farmName: string
): Promise<{ success: boolean; error?: string }> => {
  return sendViaInternalApi(INTERNAL_FARMER_EMAIL_ENDPOINT, { type: 'approval', email, farmName });
};

export const sendFarmerRejectionEmail = async (
  email: string,
  farmName: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> => {
  return sendViaInternalApi(INTERNAL_FARMER_EMAIL_ENDPOINT, { type: 'rejection', email, farmName, reason });
};

export const sendDriverApprovalEmail = async (
  email: string,
  driverName: string
): Promise<{ success: boolean; error?: string }> => {
  return sendViaInternalApi(INTERNAL_DRIVER_EMAIL_ENDPOINT, { type: 'approval', email, driverName });
};

export const sendDriverRejectionEmail = async (
  email: string,
  driverName: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> => {
  return sendViaInternalApi(INTERNAL_DRIVER_EMAIL_ENDPOINT, { type: 'rejection', email, driverName, reason });
};

export const logEmailToConsole = (
  type: MerchantEmailType,
  email: string,
  businessName: string,
  reason?: string
) => {
  console.log('\n========== EMAIL SIMULATION ==========');
  console.log(`Type: ${type === 'approval' ? 'APPROVAL' : 'REJECTION'}`);
  console.log(`To: ${email}`);
  console.log(`Business: ${businessName}`);
  if (reason) console.log(`Reason: ${reason}`);
  console.log(`Action URL: ${buildMerchantActionUrl(email)}`);
  console.log(`Base App URL: ${APP_URL}`);
  console.log('======================================\n');
};
