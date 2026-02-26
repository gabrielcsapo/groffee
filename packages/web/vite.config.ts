import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { flightRouter } from "react-flight-router/dev";
import { defineConfig } from "vite";
import { requestStorage } from "./app/lib/server/request-context";
import { apiMiddleware } from "./app/api/vite-plugin";

export default defineConfig({
  clearScreen: false,
  server: {
    host: true,
    port: 3000,
  },
  plugins: [
    tailwindcss(),
    react(),
    apiMiddleware(),
    flightRouter({
      routesFile: "./app/routes.ts",
      onRequest: (request) => {
        requestStorage.enterWith(request);
      },
    }),
  ],
  ssr: {
    external: ["better-sqlite3", "isomorphic-git", "isomorphic-dompurify"],
  },
});
