// @ts-check
import withPWA from 'next-pwa';
import { withSentryConfig } from '@sentry/nextjs';

const sanitizeEnv = (value) => (typeof value === 'string' ? value.trim() : '');

const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabaseImageHost = (() => {
    const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!supabaseUrl) return null;
    try {
        return new URL(supabaseUrl).hostname;
    } catch {
        return null;
    }
})();

const remoteImagePatterns = [
    {
        protocol: 'https',
        hostname: 'images.unsplash.com',
    },
];

if (supabaseImageHost) {
    remoteImagePatterns.push({
        protocol: 'https',
        hostname: supabaseImageHost,
    });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Temporarily disabled due to Leaflet map library incompatibility
    // Leaflet doesn't handle React 18 Strict Mode's double-invocation properly
    reactStrictMode: false,

    // Necessary for generic Supabase image hosting if used, or other external domains
    images: {
        remotePatterns: remoteImagePatterns,
        formats: ['image/webp', 'image/avif'],
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    },
    experimental: {
        optimizePackageImports: [
            'lucide-react',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            'recharts',
        ],
    },

    // HTTP Headers for caching
    async headers() {
        return [
            {
                source: '/icons/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
            {
                source: '/:path*.{jpg,jpeg,png,webp,svg,gif,ico}',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=2592000, must-revalidate',
                    },
                ],
            },
        ];
    },
};


// Workbox serializes matcher functions into the service worker with toString(), so
// they cannot close over config variables. Build the matcher with the anon key
// inlined as a literal (it is a public key, already shipped to every browser).
const supabaseCacheMatcher = new Function(
    `return ({ url, request }) => {
        if (request.method !== 'GET') return false;
        if (!/\\.supabase\\.co$/i.test(url.hostname)) return false;
        if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/rest/v1/rpc/')) return false;
        const authorization = request.headers.get('authorization');
        if (!authorization) return true;
        return authorization === ${JSON.stringify(supabaseAnonKey ? `Bearer ${supabaseAnonKey}` : '')} && ${JSON.stringify(!!supabaseAnonKey)};
    };`
)();

const pwaConfig = {
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
    fallbacks: {
        document: '/offline.html',
    },
    runtimeCaching: [
        {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
                cacheName: 'pages-cache',
                networkTimeoutSeconds: 5,
                expiration: {
                    maxEntries: 128,
                    maxAgeSeconds: 24 * 60 * 60, // 24 hours
                },
            },
        },
        {
            // Only anonymous GETs are cached. A request carrying a signed-in user's JWT
            // returns user-specific rows (orders, profile, ...) and must never be stored
            // in a cache shared by every account that uses this device, nor served stale
            // after logout. Auth endpoints and RPC calls are never cached either.
            urlPattern: supabaseCacheMatcher,
            handler: 'StaleWhileRevalidate',
            options: {
                cacheName: 'supabase-api-cache',
                expiration: {
                    maxEntries: 128,
                    maxAgeSeconds: 72 * 60 * 60, // 72 hours
                },
            },
        },
        {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
                cacheName: 'image-cache',
                expiration: {
                    maxEntries: 64,
                    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
            },
        },
        {
            // Avoid caching Next.js runtime chunks aggressively to prevent stale bundle 404s.
            // Keep CacheFirst only for fonts.
            urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
            handler: 'CacheFirst',
            options: {
                cacheName: 'font-resources',
                expiration: {
                    maxEntries: 64,
                    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
            },
        },
    ],
    publicExcludes: ['!robots.txt', '!sitemap.xml', '!manifest.json'],
    buildExcludes: [/middleware-manifest\.json$/],
};

const config =
    process.env.NODE_ENV === 'development'
        ? nextConfig
        : withPWA(pwaConfig)(nextConfig);

// withSentryConfig only instruments the build (source maps, tunnel route) and
// is a no-op at runtime when SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN aren't set -
// safe to keep wired even before a Sentry project/DSN exists.
export default withSentryConfig(config, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: true,
    widenClientFileUpload: true,
    telemetry: false,
});
