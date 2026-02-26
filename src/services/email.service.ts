// ============================================
// Email Service - Client-safe Email Triggers
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import {
  APP_URL,
  buildMerchantActionUrl,
  type MerchantEmailType,
} from './email.shared';

const INTERNAL_EMAIL_ENDPOINT = '/api/admin/merchant-email';

interface MerchantEmailApiPayload {
  type: MerchantEmailType;
  email: string;
  businessName: string;
  reason?: string;
}

const sendViaInternalApi = async (
  payload: MerchantEmailApiPayload
): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch(INTERNAL_EMAIL_ENDPOINT, {
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
  return sendViaInternalApi({ type: 'approval', email, businessName });
};

export const sendMerchantRejectionEmail = async (
  email: string,
  businessName: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> => {
  return sendViaInternalApi({ type: 'rejection', email, businessName, reason });
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
