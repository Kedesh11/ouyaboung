import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabasePublicEnv } from '@/lib/supabase/public-env'

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const isUserRoute = pathname.startsWith('/user');
    const isMerchantRoute = pathname.startsWith('/merchant') && !pathname.startsWith('/merchant/register');
    const isFarmerRoute = pathname.startsWith('/farmer') && !pathname.startsWith('/farmer/register');
    const isDriverRoute = pathname.startsWith('/driver') && !pathname.startsWith('/driver/register');
    const isAdminRoute = pathname.startsWith('/admin');
    const isAuthPage = pathname === '/auth' || pathname === '/forgot-password' || pathname.startsWith('/auth/reset');

    // Create an unmodified response first
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Environment variables
    const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabasePublicEnv()

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Missing Supabase environment variables')
        return response
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    // This will refresh session if expired - required for Server Components
    // https://supabase.com/docs/guides/auth/server-side/nextjs
    const { data: { user } } = await supabase.auth.getUser()

    let userRole: string | null = null

    if (user) {
        const metadataRole = typeof user.user_metadata?.role === 'string'
            ? user.user_metadata.role
            : (typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : null)
        userRole = metadataRole

        let shouldLookupProfileRole = !userRole && (isUserRoute || isMerchantRoute || isFarmerRoute || isDriverRoute || isAdminRoute || isAuthPage)

        if (!shouldLookupProfileRole) {
            if (isAdminRoute && userRole !== 'admin') shouldLookupProfileRole = true;
            if (isMerchantRoute && userRole !== 'merchant') shouldLookupProfileRole = true;
            if (isFarmerRoute && userRole !== 'farmer') shouldLookupProfileRole = true;
            if (isDriverRoute && userRole !== 'driver') shouldLookupProfileRole = true;
        }

        if (shouldLookupProfileRole) {
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('user_id', user.id)
                    .single()

                userRole = profile?.role || 'user'
            } catch {
                userRole = 'user'
            }
        }
    }

    // Redirect authenticated users away from auth pages
    if (isAuthPage && user) {
        const redirectMap: Record<string, string> = {
            'admin': '/admin',
            'merchant': '/merchant',
            'farmer': '/farmer',
            'driver': '/driver',
            'user': '/user',
        };
        const redirectPath = redirectMap[userRole || 'user'] || '/';
        return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    // Protect user routes
    if (isUserRoute) {
        if (!user) {
            const url = new URL('/auth', request.url);
            url.searchParams.set('redirect', pathname);
            return NextResponse.redirect(url);
        }
        if (userRole !== 'user') {
            const url = new URL('/', request.url);
            return NextResponse.redirect(url);
        }
    }

    // Protect merchant routes
    if (isMerchantRoute) {
        if (!user) {
            const url = new URL('/auth', request.url);
            url.searchParams.set('role', 'merchant');
            url.searchParams.set('redirect', pathname);
            return NextResponse.redirect(url);
        }
        if (userRole !== 'merchant') {
            // Allow users to see merchant layout? No, strict separation
            const url = new URL('/', request.url);
            return NextResponse.redirect(url);
        }
    }

    // Protect farmer routes
    if (isFarmerRoute) {
        if (!user) {
            const url = new URL('/auth', request.url);
            url.searchParams.set('role', 'farmer');
            url.searchParams.set('redirect', pathname);
            return NextResponse.redirect(url);
        }
        if (userRole !== 'farmer') {
            const url = new URL('/', request.url);
            return NextResponse.redirect(url);
        }
    }

    // Protect driver routes
    if (isDriverRoute) {
        if (!user) {
            const url = new URL('/auth', request.url);
            url.searchParams.set('role', 'driver');
            url.searchParams.set('redirect', pathname);
            return NextResponse.redirect(url);
        }
        if (userRole !== 'driver') {
            const url = new URL('/', request.url);
            return NextResponse.redirect(url);
        }
    }

    // Protect admin routes
    if (isAdminRoute) {
        if (!user) {
            const url = new URL('/auth', request.url);
            url.searchParams.set('redirect', pathname);
            return NextResponse.redirect(url);
        }
        if (userRole !== 'admin') {
            const url = new URL('/', request.url);
            return NextResponse.redirect(url);
        }
    }

    return response
}

export const config = {
    matcher: [
        '/admin/:path*',
        '/merchant/:path*',
        '/farmer/:path*',
        '/driver/:path*',
        '/user/:path*',
        '/auth',
        '/auth/:path*',
        '/forgot-password',
    ],
}
