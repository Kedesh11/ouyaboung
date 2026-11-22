import type { MetadataRoute } from "next";


import { APP_BASE_URL } from "@/lib/config";
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
