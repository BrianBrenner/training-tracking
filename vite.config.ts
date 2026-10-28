/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative paths so the build works from any static host path (GitHub Pages serves it under /training-tracking/).
  base: "./",
  plugins: [
    react(),
    VitePWA({
      // Ask before switching to a new version (src/lib/pwa.ts), so an update never interrupts logging.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Training Log",
        short_name: "Training",
        description: "Log climbing, hangboard and lifting sessions and see your training over time.",
        theme_color: "#0e0e10",
        background_color: "#0e0e10",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  test: {
    // infra/ has its own tests and dependencies.
    include: ["src/**/*.test.ts"],
  },
});
