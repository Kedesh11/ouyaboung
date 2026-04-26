// @ts-check
import withPWA from 'next-pwa';

const sanitizeEnv = (value) => (typeof value === 'string' ? value.trim() : '');

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
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
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

export default config;
