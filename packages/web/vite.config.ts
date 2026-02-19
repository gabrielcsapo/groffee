import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  build: {
    minify: false,
  },
  preview: {
    host: true,
    port: 3000,
    proxy: {
      "/api": "http://localhost:3001",
      "^/[^/]+/[^/]+\\.git": {
        target: "http://localhost:3001",
      },
    },
  },
  server: {
    host: true,
    port: 3000,
    proxy: {
      "/api": "http://localhost:3001",
      "^/[^/]+/[^/]+\\.git": {
        target: "http://localhost:3001",
      },
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    rsc({
      entries: {
        client: "./react-router-vite/entry.browser.tsx",
        ssr: "./react-router-vite/entry.ssr.tsx",
        rsc: "./app/entry.rsc.ts",
      },
    }),
  ],
  environments: {
    rsc: {
      resolve: {
        external: ["better-sqlite3", "isomorphic-git"],
      },
    },
    ssr: {
      resolve: {
        external: ["better-sqlite3", "isomorphic-git"],
      },
    },
  },
  optimizeDeps: {
    include: ["react-router", "react-router/internal/react-server-client"],
  },
}) as any;
