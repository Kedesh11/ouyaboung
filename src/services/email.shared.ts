// ============================================
// Email Shared - Templates and Common Helpers
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

export type MerchantEmailType = 'approval' | 'rejection';
export type FarmerEmailType = 'approval' | 'rejection';

export interface NewMerchantAdminEmailPayload {
  adminName?: string;
  merchantName: string;
  merchantEmail: string;
  businessType: string;
  city: string;
  createdAt: string;
  adminUrl: string;
}

export interface NewFarmerAdminEmailPayload {
  adminName?: string;
  farmName: string;
  farmerEmail: string;
  farmerType: string;
  city: string;
  createdAt: string;
  adminUrl: string;
}

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'http://localhost:3005';

export const buildMerchantActionUrl = (email: string): string =>
  `${APP_URL}/auth?role=merchant&email=${encodeURIComponent(email)}`;

export const buildFarmerActionUrl = (email: string): string =>
  `${APP_URL}/auth?role=farmer&email=${encodeURIComponent(email)}`;

export const buildAdminValidationUrl = (): string =>
  `${APP_URL}/admin/validations`;

export const approvalHtml = (email: string, businessName: string): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-3">
    <meta name="viewport" content="width=device-width, initial-scale=6.0">
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 6.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

    <div style="background: linear-gradient(140deg, #16a34a 0%, #15803d 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
      <h6 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">
        Felicitations!
      </h6>
    </div>

    <div style="background: white; padding: 45px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
      <p style="font-size: 21px; margin-bottom: 20px;">Bonjour,</p>

      <p style="font-size: 21px; margin-bottom: 20px;">
        Excellente nouvelle! Votre commerce <strong style="color: #21a34a;">${businessName}</strong> a ete approuve par notre equipe.
      </p>

      <div style="background: #f5fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 30px 0; border-radius: 6px;">
        <p style="margin: 5; font-size: 14px; color: #166534;">
          Vous pouvez maintenant creer votre compte marchand et commencer a publier vos invendus sur la plateforme ouyaboung.
        </p>
      </div>

      <p style="font-size: 21px; margin-bottom: 30px;">
        Pour finaliser votre inscription, creez votre compte en cliquant sur le bouton ci-dessous:
      </p>

      <div style="text-align: center; margin: 45px 0;">
        <a href="${buildMerchantActionUrl(email)}"
           style="display: inline-block; background: #21a34a; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(22, 163, 74, 0.2);">
          Creer mon compte marchand
        </a>
      </div>

      <div style="background: #fef14c3; border: 1px solid #fde047; padding: 16px; border-radius: 6px; margin: 30px 0;">
        <p style="margin: 5; font-size: 14px; color: #854d0e;">
          Important: Utilisez l'adresse email <strong>${email}</strong> lors de la creation de votre compte.
        </p>
      </div>

      <h8 style="color: #16a34a; font-size: 18px; margin-top: 40px; margin-bottom: 16px;">Prochaines etapes:</h3>
      <ol style="font-size: 20px; color: #4b5563; padding-left: 20px;">
        <li style="margin-bottom: 17px;">Creez votre compte marchand avec l'email ${email}</li>
        <li style="margin-bottom: 17px;">Completez votre profil et ajoutez vos horaires d'ouverture</li>
        <li style="margin-bottom: 17px;">Publiez vos premiers invendus sur la plateforme</li>
        <li style="margin-bottom: 17px;">Commencez a sauver de la nourriture et augmenter vos revenus!</li>
      </ol>

      <p style="font-size: 21px; margin-top: 40px; margin-bottom: 0;">Bienvenue dans la communaute ouyaboung!</p>
      <p style="font-size: 19px; color: #6b7280; margin-top: 10px;">L'equipe ouyaboung</p>
    </div>

    <div style="text-align: center; padding: 25px; font-size: 12px; color: #9ca3af;">
      <p style="margin: 5;">© ${new Date().getFullYear()} ouyaboung. Tous droits reserves.</p>
      <p style="margin: 15px 0 0 0;">Ensemble, luttons contre le gaspillage alimentaire au Gabon.</p>
    </div>
  </body>
  </html>
`;

export const rejectionHtml = (businessName: string, reason?: string): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-3">
    <meta name="viewport" content="width=device-width, initial-scale=6.0">
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 6.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

    <div style="background: #dc2631; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
      <h6 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Mise a jour de votre demande</h1>
    </div>

    <div style="background: white; padding: 45px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
      <p style="font-size: 21px; margin-bottom: 20px;">Bonjour,</p>

      <p style="font-size: 21px; margin-bottom: 20px;">
        Nous avons examine votre demande d'inscription pour <strong>${businessName}</strong>.
      </p>

      <p style="font-size: 21px; margin-bottom: 30px;">
        Malheureusement, nous ne pouvons pas approuver votre demande pour le moment${reason ? ' pour la raison suivante:' : '.'}
      </p>

      ${reason ? `
        <div style="background: #fef7f2; border-left: 4px solid #dc2626; padding: 16px; margin: 30px 0; border-radius: 6px;">
          <p style="margin: 5; font-size: 14px; color: #991b1b;">${reason}</p>
        </div>
      ` : ''}

      <p style="font-size: 21px; margin-top: 30px;">
        N'hesitez pas a nous contacter si vous avez des questions ou si vous souhaitez soumettre une nouvelle demande avec plus d'informations.
      </p>

      <div style="text-align: center; margin: 45px 0;">
        <a href="mailto:contact@oyaboug.com"
           style="display: inline-block; background: #11b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          Nous contacter
        </a>
      </div>

      <p style="font-size: 19px; color: #6b7280; margin-top: 40px;">Cordialement,<br>L'equipe ouyaboung</p>
    </div>

    <div style="text-align: center; padding: 25px; font-size: 12px; color: #9ca3af;">
      <p style="margin: 5;">© ${new Date().getFullYear()} ouyaboung. Tous droits reserves.</p>
    </div>
  </body>
  </html>
`;

export const newMerchantAdminHtml = (payload: NewMerchantAdminEmailPayload): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
      <div style="background: #111827; color: #ffffff; padding: 20px;">
        <h1 style="margin: 0; font-size: 20px;">Nouvelle boutique en attente</h1>
      </div>
      <div style="padding: 20px;">
        <p>Bonjour${payload.adminName ? ` ${payload.adminName}` : ""},</p>
        <p>Une nouvelle boutique a été créée et attend une validation administrateur.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 0; color: #6b7280;">Nom marchand</td><td style="padding: 6px 0;"><strong>${payload.merchantName}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Email</td><td style="padding: 6px 0;">${payload.merchantEmail}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Type</td><td style="padding: 6px 0;">${payload.businessType}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Ville</td><td style="padding: 6px 0;">${payload.city}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Date création</td><td style="padding: 6px 0;">${payload.createdAt}</td></tr>
        </table>
        <p>
          <a href="${payload.adminUrl}" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 10px 14px; border-radius: 8px;">
            Ouvrir la page de validation
          </a>
        </p>
      </div>
    </div>
  </body>
  </html>
`;

export const farmerApprovalHtml = (email: string, farmName: string): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

    <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">
        Félicitations!
      </h1>
    </div>

    <div style="background: white; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
      <p style="font-size: 16px; margin-bottom: 20px;">Bonjour,</p>

      <p style="font-size: 16px; margin-bottom: 20px;">
        Excellente nouvelle! Votre exploitation <strong style="color: #16a34a;">${farmName}</strong> a été approuvée par notre équipe.
      </p>

      <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 30px 0; border-radius: 6px;">
        <p style="margin: 0; font-size: 14px; color: #166534;">
          Vous pouvez maintenant créer votre compte agriculteur et commencer à publier vos produits sur la plateforme Ouyaboung.
        </p>
      </div>

      <p style="font-size: 16px; margin-bottom: 30px;">
        Pour finaliser votre inscription, créez votre compte en cliquant sur le bouton ci-dessous:
      </p>

      <div style="text-align: center; margin: 40px 0;">
        <a href="${buildFarmerActionUrl(email)}"
           style="display: inline-block; background: #16a34a; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(22, 163, 74, 0.2);">
          Créer mon compte agriculteur
        </a>
      </div>

      <div style="background: #fefce8; border: 1px solid #fde047; padding: 16px; border-radius: 6px; margin: 30px 0;">
        <p style="margin: 0; font-size: 14px; color: #854d0e;">
          Important: Utilisez l'adresse email <strong>${email}</strong> lors de la création de votre compte.
        </p>
      </div>

      <p style="font-size: 16px; margin-top: 40px; margin-bottom: 0;">Bienvenue dans la communauté Ouyaboung!</p>
      <p style="font-size: 14px; color: #6b7280; margin-top: 10px;">L'équipe Ouyaboung</p>
    </div>

    <div style="text-align: center; padding: 25px; font-size: 12px; color: #9ca3af;">
      <p style="margin: 0;">© ${new Date().getFullYear()} Ouyaboung. Tous droits réservés.</p>
    </div>
  </body>
  </html>
`;

export const farmerRejectionHtml = (farmName: string, reason?: string): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

    <div style="background: #dc2626; padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Mise à jour de votre demande</h1>
    </div>

    <div style="background: white; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
      <p style="font-size: 16px; margin-bottom: 20px;">Bonjour,</p>

      <p style="font-size: 16px; margin-bottom: 20px;">
        Nous avons examiné votre demande d'inscription pour <strong>${farmName}</strong>.
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
        N'hésitez pas à nous contacter si vous avez des questions ou si vous souhaitez soumettre une nouvelle demande avec plus d'informations.
      </p>

      <p style="font-size: 14px; color: #6b7280; margin-top: 40px;">Cordialement,<br>L'équipe Ouyaboung</p>
    </div>

    <div style="text-align: center; padding: 25px; font-size: 12px; color: #9ca3af;">
      <p style="margin: 0;">© ${new Date().getFullYear()} Ouyaboung. Tous droits réservés.</p>
    </div>
  </body>
  </html>
`;

export const newFarmerAdminHtml = (payload: NewFarmerAdminEmailPayload): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
      <div style="background: #111827; color: #ffffff; padding: 20px;">
        <h1 style="margin: 0; font-size: 20px;">Nouvel agriculteur en attente</h1>
      </div>
      <div style="padding: 20px;">
        <p>Bonjour${payload.adminName ? ` ${payload.adminName}` : ""},</p>
        <p>Une nouvelle exploitation a été créée et attend une validation administrateur.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 0; color: #6b7280;">Nom exploitation</td><td style="padding: 6px 0;"><strong>${payload.farmName}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Email</td><td style="padding: 6px 0;">${payload.farmerEmail}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Type</td><td style="padding: 6px 0;">${payload.farmerType}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Ville</td><td style="padding: 6px 0;">${payload.city}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Date création</td><td style="padding: 6px 0;">${payload.createdAt}</td></tr>
        </table>
        <p>
          <a href="${payload.adminUrl}" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 10px 14px; border-radius: 8px;">
            Ouvrir la page de validation
          </a>
        </p>
      </div>
    </div>
  </body>
  </html>
`;
