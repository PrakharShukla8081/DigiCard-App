import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beno Card",
    short_name: "Beno Card",
    start_url: "/me",
    scope: "/",
    display: "standalone",
    background_color: "#F5F6FB",
    theme_color: "#4F46E5",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
