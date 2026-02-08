// @ts-check
import withPWA from 'next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Temporarily disabled due to Leaflet map library incompatibility
    // Leaflet doesn't handle React 18 Strict Mode's double-invocation properly
    reactStrictMode: false,

    // Necessary for generic Supabase image hosting if used, or other external domains
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
        formats: ['image/webp', 'image/avif'],
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
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

const config = withPWA({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
    runtimeCaching: [
        {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
                cacheName: 'supabase-api-cache',
                expiration: {
                    maxEntries: 32,
                    maxAgeSeconds: 24 * 60 * 60, // 24 hours
                },
                networkTimeoutSeconds: 10,
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
            urlPattern: /\.(?:js|css|woff|woff2|ttf|otf|eot)$/i,
            handler: 'CacheFirst',
            options: {
                cacheName: 'static-resources',
                expiration: {
                    maxEntries: 64,
                    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
            },
        },
    ],
    publicExcludes: ['!robots.txt', '!sitemap.xml', '!manifest.json'],
    buildExcludes: [/middleware-manifest\.json$/],
})(nextConfig);

export default config;
