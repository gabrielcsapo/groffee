import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  build: {
    minify: false,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    rsc({
      entries: {
        client: "./react-router-vite/entry.browser.tsx",
        ssr: "./react-router-vite/entry.ssr.tsx",
        rsc: "./react-router-vite/entry.rsc.single.tsx",
      },
    }),
  ],
  optimizeDeps: {
    include: ["react-router", "react-router/internal/react-server-client"],
  },
}) as any;
