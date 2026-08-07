import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendAdminNewDriverEmail } from './email.server';

interface DriverForNotification {
  id: string;
  full_name: string;
  vehicle_type: string;
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

export const dispatchNewDriverNotifications = async (
  supabase: SupabaseClient,
  driver: DriverForNotification
): Promise<DispatchResult> => {
  try {
    console.info('[DriverOnboarding] Dispatch start', {
      driverId: driver.id,
      fullName: driver.full_name,
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

      const emailResult = await sendAdminNewDriverEmail({
        adminEmail: admin.email,
        adminName: admin.full_name || undefined,
        driverName: driver.full_name,
        driverEmail: driver.email,
        vehicleType: driver.vehicle_type,
        city: driver.city,
        createdAt: new Date(driver.created_at).toLocaleString('fr-FR'),
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

    console.info('[DriverOnboarding] Dispatch summary', {
      driverId: driver.id,
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
