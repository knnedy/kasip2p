import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Pair and transfer pages carry device ids: useless (and private) in search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/pair/", "/transfer/", "/__downloads/"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
