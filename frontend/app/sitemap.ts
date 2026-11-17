import type { MetadataRoute } from "next";

const paths = ["/", "/pricing", "/demo", "/nfc", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return paths.map((path) => ({ url: new URL(path, baseUrl).toString() }));
}
