// ============================================
// Email Service - Professional Email Sending
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
const FROM_EMAIL = 'ouyaboung <noreply@oyaboug.com>';
const INTERNAL_EMAIL_ENDPOINT = '/api/admin/merchant-email';

type MerchantEmailType = 'approval' | 'rejection';

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

const sendWithResend = async (
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> => {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured. Email not sent.');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Resend API error:', errorData);
      return { success: false, error: errorData.message || 'Email send failed' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

const approvalHtml = (email: string, businessName: string): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

    <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">
        Felicitations!
      </h1>
    </div>

    <div style="background: white; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
      <p style="font-size: 16px; margin-bottom: 20px;">Bonjour,</p>

      <p style="font-size: 16px; margin-bottom: 20px;">
        Excellente nouvelle! Votre commerce <strong style="color: #16a34a;">${businessName}</strong> a ete approuve par notre equipe.
      </p>

      <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 30px 0; border-radius: 6px;">
        <p style="margin: 0; font-size: 14px; color: #166534;">
          Vous pouvez maintenant creer votre compte marchand et commencer a publier vos invendus sur la plateforme ouyaboung.
        </p>
      </div>

      <p style="font-size: 16px; margin-bottom: 30px;">
        Pour finaliser votre inscription, creez votre compte en cliquant sur le bouton ci-dessous:
      </p>

      <div style="text-align: center; margin: 40px 0;">
        <a href="${APP_URL}/auth?role=merchant&email=${encodeURIComponent(email)}"
           style="display: inline-block; background: #16a34a; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(22, 163, 74, 0.2);">
          Creer mon compte marchand
        </a>
      </div>

      <div style="background: #fef9c3; border: 1px solid #fde047; padding: 16px; border-radius: 6px; margin: 30px 0;">
        <p style="margin: 0; font-size: 14px; color: #854d0e;">
          Important: Utilisez l'adresse email <strong>${email}</strong> lors de la creation de votre compte.
        </p>
      </div>

      <h3 style="color: #16a34a; font-size: 18px; margin-top: 40px; margin-bottom: 16px;">Prochaines etapes:</h3>
      <ol style="font-size: 15px; color: #4b5563; padding-left: 20px;">
        <li style="margin-bottom: 12px;">Creez votre compte marchand avec l'email ${email}</li>
        <li style="margin-bottom: 12px;">Completez votre profil et ajoutez vos horaires d'ouverture</li>
        <li style="margin-bottom: 12px;">Publiez vos premiers invendus sur la plateforme</li>
        <li style="margin-bottom: 12px;">Commencez a sauver de la nourriture et augmenter vos revenus!</li>
      </ol>

      <p style="font-size: 16px; margin-top: 40px; margin-bottom: 0;">Bienvenue dans la communaute ouyaboung!</p>
      <p style="font-size: 14px; color: #6b7280; margin-top: 10px;">L'equipe ouyaboung</p>
    </div>

    <div style="text-align: center; padding: 20px; font-size: 12px; color: #9ca3af;">
      <p style="margin: 0;">© ${new Date().getFullYear()} ouyaboung. Tous droits reserves.</p>
      <p style="margin: 10px 0 0 0;">Ensemble, luttons contre le gaspillage alimentaire au Gabon.</p>
    </div>
  </body>
  </html>
`;

const rejectionHtml = (businessName: string, reason?: string): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

    <div style="background: #dc2626; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Mise a jour de votre demande</h1>
    </div>

    <div style="background: white; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
      <p style="font-size: 16px; margin-bottom: 20px;">Bonjour,</p>

      <p style="font-size: 16px; margin-bottom: 20px;">
        Nous avons examine votre demande d'inscription pour <strong>${businessName}</strong>.
      </p>

      <p style="font-size: 16px; margin-bottom: 30px;">
        Malheureusement, nous ne pouvons pas approuver votre demande pour le moment${reason ? ' pour la raison suivante:' : '.'}
      </p>

      ${reason ? `
        <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 30px 0; border-radius: 6px;">
          <p style="margin: 0; font-size: 14px; color: #991b1b;">${reason}</p>
        </div>
      ` : ''}

      <p style="font-size: 16px; margin-top: 30px;">
        N'hesitez pas a nous contacter si vous avez des questions ou si vous souhaitez soumettre une nouvelle demande avec plus d'informations.
      </p>

      <div style="text-align: center; margin: 40px 0;">
        <a href="mailto:contact@oyaboug.com"
           style="display: inline-block; background: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          Nous contacter
        </a>
      </div>

      <p style="font-size: 14px; color: #6b7280; margin-top: 40px;">Cordialement,<br>L'equipe ouyaboung</p>
    </div>

    <div style="text-align: center; padding: 20px; font-size: 12px; color: #9ca3af;">
      <p style="margin: 0;">© ${new Date().getFullYear()} ouyaboung. Tous droits reserves.</p>
    </div>
  </body>
  </html>
`;

/**
 * Send merchant approval email
 */
export const sendMerchantApprovalEmail = async (
  email: string,
  businessName: string
): Promise<{ success: boolean; error?: string }> => {
  if (typeof window !== 'undefined') {
    return sendViaInternalApi({ type: 'approval', email, businessName });
  }

  const subject = `${businessName} - Votre commerce a ete approuve!`;
  return sendWithResend(email, subject, approvalHtml(email, businessName));
};

/**
 * Send merchant rejection email
 */
export const sendMerchantRejectionEmail = async (
  email: string,
  businessName: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> => {
  if (typeof window !== 'undefined') {
    return sendViaInternalApi({ type: 'rejection', email, businessName, reason });
  }

  const subject = `${businessName} - Mise a jour de votre demande`;
  return sendWithResend(email, subject, rejectionHtml(businessName, reason));
};

/**
 * Fallback: Log email to console if Resend is not configured
 */
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
  console.log(`Action URL: ${APP_URL}/auth?role=merchant&email=${encodeURIComponent(email)}`);
  console.log('======================================\n');
};
