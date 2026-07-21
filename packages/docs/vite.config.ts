import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeShiki from "@shikijs/rehype";
import { defineConfig } from "vite";
import { searchIndexPlugin } from "./src/search-index-plugin";
import { copyFileSync } from "node:fs";

export default defineConfig({
  base: "/groffee/",
  // The workspace UI package declares React as a peer dependency. pnpm can
  // resolve that peer through a different patch version than the docs app,
  // which produces two React dispatchers in the production bundle (hooks
  // such as useId then fail at runtime). Always bundle the docs site against
  // the app's single React/ReactDOM instances.
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 3001,
  },
  plugins: [
    tailwindcss(),
    {
      enforce: "pre" as const,
      ...mdx({
        providerImportSource: "@mdx-js/react",
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          [
            rehypeShiki,
            {
              themes: { light: "github-light", dark: "github-dark" },
              defaultColor: false,
            },
          ],
        ],
      }),
    },
    react({ include: /\.(jsx|tsx|mdx)$/ }),
    searchIndexPlugin(),
    {
      name: "github-pages-spa-fallback",
      closeBundle() {
        // GitHub Pages serves 404.html for deep links. Shipping the SPA shell
        // there lets the client router render /groffee/docs/* on refresh.
        copyFileSync("dist/index.html", "dist/404.html");
      },
    },
  ],
});
