import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Create an unmodified response first
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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
        // Fetch user profile to get role
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', user.id)
                .single()

            userRole = profile?.role || user.user_metadata?.role || 'user'
        } catch (e) {
            console.error('Error fetching role in middleware:', e)
            userRole = user.user_metadata?.role || 'user'
        }
    }

    // Define protected routes
    const isUserRoute = pathname.startsWith('/user');
    const isMerchantRoute = pathname.startsWith('/merchant') && !pathname.startsWith('/merchant/register');
    const isAdminRoute = pathname.startsWith('/admin');
    const isAuthPage = pathname === '/auth' || pathname === '/forgot-password' || pathname.startsWith('/auth/reset');

    // Redirect authenticated users away from auth pages
    if (isAuthPage && user) {
        const redirectMap: Record<string, string> = {
            'admin': '/admin',
            'merchant': '/merchant',
            'user': '/user',
        };
        const redirectPath = redirectMap[userRole || 'user'] || '/';
        console.log(`[Middleware] Redirecting authenticated user (role: ${userRole}) to ${redirectPath}`);
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
        '/user/:path*',
        '/auth',
        '/auth/:path*',
        '/forgot-password',
    ],
}
