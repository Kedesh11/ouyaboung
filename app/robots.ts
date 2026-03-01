import type { MetadataRoute } from "next";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ouyaboung-eight.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/merchant", "/user", "/auth", "/api"],
      },
    ],
    sitemap: `${APP_BASE_URL}/sitemap.xml`,
    host: APP_BASE_URL,
  };
}
