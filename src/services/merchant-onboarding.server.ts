import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendAdminNewMerchantEmail } from './email.server';

interface MerchantForNotification {
  id: string;
  business_name: string;
  business_type: string;
  email: string;
  phone: string;
  city: string;
  created_at: string;
}

interface AdminContact {
  user_id: string;
  email: string;
  full_name?: string | null;
}

interface DispatchResult {
  success: boolean;
  internalNotificationsSent: number;
  emailsSent: number;
  emailFailures: Array<{ email: string; error: string }>;
  error?: string;
}

const loadAdminContacts = async (
  supabase: SupabaseClient
): Promise<{ data: AdminContact[] | null; error?: string }> => {
  const { data, error } = await supabase.rpc('get_admin_contacts');

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: (data || []) as AdminContact[],
  };
};

export const dispatchNewMerchantNotifications = async (
  supabase: SupabaseClient,
  merchant: MerchantForNotification
): Promise<DispatchResult> => {
  try {
    console.info('[MerchantOnboarding] Dispatch start', {
      merchantId: merchant.id,
      businessName: merchant.business_name,
    });

    const adminResult = await loadAdminContacts(supabase);
    if (!adminResult.data || adminResult.data.length === 0) {
      return {
        success: false,
        internalNotificationsSent: 0,
        emailsSent: 0,
        emailFailures: [],
        error: adminResult.error || 'Aucun administrateur trouvé',
      };
    }

    const admins = adminResult.data;

    const emailFailures: Array<{ email: string; error: string }> = [];
    let emailsSent = 0;

    for (const admin of admins) {
      if (!admin.email) continue;

      const emailResult = await sendAdminNewMerchantEmail({
        adminEmail: admin.email,
        adminName: admin.full_name || undefined,
        merchantName: merchant.business_name,
        merchantEmail: merchant.email,
        businessType: merchant.business_type,
        city: merchant.city,
        createdAt: new Date(merchant.created_at).toLocaleString('fr-FR'),
      });

      if (emailResult.success) {
        emailsSent += 1;
      } else {
        emailFailures.push({
          email: admin.email,
          error: emailResult.error || 'Erreur SMTP inconnue',
        });
      }
    }

    console.info('[MerchantOnboarding] Dispatch summary', {
      merchantId: merchant.id,
      emailsSent,
      emailFailures: emailFailures.length,
    });

    return {
      success: true,
      internalNotificationsSent: 0,
      emailsSent,
      emailFailures,
    };
  } catch (error: any) {
    return {
      success: false,
      internalNotificationsSent: 0,
      emailsSent: 0,
      emailFailures: [],
      error: error?.message || 'Erreur inconnue pendant la notification onboarding',
    };
  }
};
