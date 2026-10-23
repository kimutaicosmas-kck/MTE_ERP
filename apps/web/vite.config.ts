import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-192.jpg", "icon-512.jpg"],
      manifest: {
        id: "/",
        name: "MTE ERP",
        short_name: "MTE ERP",
        description: "Earth-moving parts operations",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait-primary",
        background_color: "#111418",
        theme_color: "#c4a035",
        icons: [
          { src: "/icon-192.jpg", sizes: "192x192", type: "image/jpeg", purpose: "any" },
          { src: "/icon-512.jpg", sizes: "512x512", type: "image/jpeg", purpose: "any" },
          { src: "/icon-512.jpg", sizes: "512x512", type: "image/jpeg", purpose: "maskable" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,jpg,png,woff2,webmanifest}"],
      },
      selfDestroying: false,
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/uploads": "http://localhost:4000",
    },
  },
});
