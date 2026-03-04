import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { defineConfig } from "vite";
import { searchIndexPlugin } from "./src/search-index-plugin";

export default defineConfig({
  base: "/groffee/",
  server: {
    port: 3001,
  },
  plugins: [
    tailwindcss(),
    { enforce: "pre" as const, ...mdx({ remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] }) },
    react({ include: /\.(jsx|tsx|mdx)$/ }),
    searchIndexPlugin(),
  ],
});
