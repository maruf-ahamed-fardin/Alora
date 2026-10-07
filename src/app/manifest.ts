import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alora — Omnichannel AI Customer Support",
    short_name: "Alora",
    description:
      "Omnichannel AI customer support chatbot replying naturally in Bangla, Banglish, and English.",
    start_url: "/inbox",
    id: "/inbox",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#059669",
    orientation: "portrait-primary",
    categories: ["business", "productivity", "communication"],
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
