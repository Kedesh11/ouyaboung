// ============================================
// Auth Redirect Handler - Post-Authentication Redirect
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const AuthRedirectHandlerContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { userRole, isAuthenticated, loading, isVerifiedMerchant } = useAuth();

  useEffect(() => {
    if (loading) return;

    // Ne rediriger que si on vient de l'authentification (returnTo param) ou si on est sur la page d'accueil
    const returnTo = searchParams?.get('returnTo');
    const shouldRedirect = returnTo || pathname === '/' || pathname === '/auth';

    if (isAuthenticated && userRole && shouldRedirect) {
      if (returnTo) {
        router.replace(returnTo);
        return;
      }

      // Default redirects based on role
      switch (userRole) {
        case 'admin':
          router.replace('/admin');
          break;
        case 'merchant':
          if (isVerifiedMerchant) {
            router.replace('/merchant');
          } else {
            // Not verified, send to success/pending page
            router.replace('/merchant/register/success');
          }
          break;
        case 'farmer':
          router.replace('/farmer');
          break;
        case 'driver':
          router.replace('/driver');
          break;
        case 'user':
        default:
          router.replace('/user');
          break;
      }
    }
  }, [isAuthenticated, userRole, loading, router, searchParams, pathname, isVerifiedMerchant]);

  return null;
};

export const AuthRedirectHandler = () => {
  return (
    <Suspense fallback={null}>
      <AuthRedirectHandlerContent />
    </Suspense>
  );
};