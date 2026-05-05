import { createBrowserRouter } from "react-router";
import { LandingLayout } from "./layouts/landing-layout";
import { DocsLayout } from "./layouts/docs-layout";

function mdxRoute(path: string, importFn: () => Promise<{ default: React.ComponentType }>) {
  return {
    path,
    lazy: async () => {
      const mod = await importFn();
      return { Component: mod.default };
    },
  };
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      Component: LandingLayout,
      children: [
        {
          index: true,
          lazy: () => import("./pages/index"),
        },
      ],
    },
    {
      path: "/docs",
      Component: DocsLayout,
      children: [
        {
          index: true,
          lazy: async () => {
            const mod = await import("./pages/getting-started.mdx");
            return { Component: mod.default };
          },
        },
        mdxRoute("getting-started", () => import("./pages/getting-started.mdx")),
        mdxRoute("architecture", () => import("./pages/architecture.mdx")),
        mdxRoute("configuration", () => import("./pages/configuration.mdx")),
        mdxRoute("deployment", () => import("./pages/deployment.mdx")),
        mdxRoute("cli", () => import("./pages/cli.mdx")),
        mdxRoute("ssh", () => import("./pages/ssh.mdx")),
        mdxRoute("git-lfs", () => import("./pages/git-lfs.mdx")),
        mdxRoute("database", () => import("./pages/database.mdx")),
        {
          path: "api",
          lazy: () => import("./pages/api"),
        },
        {
          path: "*",
          lazy: () => import("./pages/not-found"),
        },
      ],
    },
  ],
  {
    basename: "/groffee",
  },
);
