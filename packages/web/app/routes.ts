import type { unstable_RSCRouteConfigEntry } from "react-router";

export const routes: unstable_RSCRouteConfigEntry[] = [
  {
    id: "root",
    path: "",
    lazy: () => import("./root"),
    children: [
      {
        id: "home",
        index: true,
        lazy: () => import("./routes/home"),
      },
      {
        id: "login",
        path: "login",
        lazy: () => import("./routes/login"),
      },
      {
        id: "register",
        path: "register",
        lazy: () => import("./routes/register"),
      },
      {
        id: "explore",
        path: "explore",
        lazy: () => import("./routes/explore"),
      },
      {
        id: "new-repo",
        path: "new",
        lazy: () => import("./routes/new-repo"),
      },
      {
        id: "docs",
        path: "docs",
        lazy: () => import("./routes/docs"),
      },
      {
        id: "user-profile",
        path: ":owner",
        lazy: () => import("./routes/user-profile"),
      },
      {
        id: "repo-layout",
        path: ":owner/:repo",
        lazy: () => import("./routes/repo-layout"),
        children: [
          {
            id: "repo",
            index: true,
            lazy: () => import("./routes/repo"),
          },
          {
            id: "repo-tree",
            path: "tree/*",
            lazy: () => import("./routes/repo-tree"),
          },
          {
            id: "repo-blob",
            path: "blob/*",
            lazy: () => import("./routes/repo-blob"),
          },
          {
            id: "repo-commits",
            path: "commits/:ref",
            lazy: () => import("./routes/repo-commits"),
          },
          {
            id: "repo-commit",
            path: "commit/:sha",
            lazy: () => import("./routes/repo-commit"),
          },
          {
            id: "repo-settings",
            path: "settings",
            lazy: () => import("./routes/repo-settings"),
          },
          {
            id: "issues",
            path: "issues",
            lazy: () => import("./routes/issues"),
          },
          {
            id: "issue-new",
            path: "issues/new",
            lazy: () => import("./routes/issue-new"),
          },
          {
            id: "issue-detail",
            path: "issue/:number",
            lazy: () => import("./routes/issue-detail"),
          },
          {
            id: "pulls",
            path: "pulls",
            lazy: () => import("./routes/pulls"),
          },
          {
            id: "pull-new",
            path: "pulls/new",
            lazy: () => import("./routes/pull-new"),
          },
          {
            id: "pull-detail",
            path: "pull/:number",
            lazy: () => import("./routes/pull-detail"),
            children: [
              {
                id: "pull-conversation",
                index: true,
                lazy: () => import("./routes/pull-conversation"),
              },
              {
                id: "pull-files",
                path: "files-changed",
                lazy: () => import("./routes/pull-files"),
              },
            ],
          },
        ],
      },
    ],
  },
];
