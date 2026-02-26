import type { RouteConfig } from "react-flight-router/router";

export const routes: RouteConfig[] = [
  {
    id: "root",
    path: "",
    component: () => import("./root"),
    notFound: () => import("./routes/not-found"),
    error: () => import("./routes/error"),
    children: [
      {
        id: "home",
        index: true,
        component: () => import("./routes/home"),
      },
      {
        id: "login",
        path: "login",
        component: () => import("./routes/login"),
      },
      {
        id: "register",
        path: "register",
        component: () => import("./routes/register"),
      },
      {
        id: "explore",
        path: "explore",
        component: () => import("./routes/explore"),
      },
      {
        id: "new-repo",
        path: "new",
        component: () => import("./routes/new-repo"),
      },
      {
        id: "search",
        path: "search",
        component: () => import("./routes/search"),
      },
      {
        id: "docs",
        path: "docs",
        component: () => import("./routes/docs"),
      },
      {
        id: "settings-keys",
        path: "settings/keys",
        component: () => import("./routes/settings-keys"),
      },
      {
        id: "settings-tokens",
        path: "settings/tokens",
        component: () => import("./routes/settings-tokens"),
      },
      {
        id: "admin",
        path: "admin",
        index: true,
        component: () => import("./routes/admin"),
      },
      {
        id: "admin-logs",
        path: "admin/logs",
        component: () => import("./routes/admin-logs"),
      },
      {
        id: "admin-users",
        path: "admin/users",
        component: () => import("./routes/admin-users"),
      },
      {
        id: "user-profile",
        path: ":owner",
        component: () => import("./routes/user-profile"),
      },
      {
        id: "repo-layout",
        path: ":owner/:repo",
        component: () => import("./routes/repo-layout"),
        children: [
          {
            id: "repo",
            index: true,
            component: () => import("./routes/repo"),
          },
          {
            id: "repo-tree",
            path: "tree/:splat*",
            component: () => import("./routes/repo-tree"),
          },
          {
            id: "repo-blob",
            path: "blob/:splat*",
            component: () => import("./routes/repo-blob"),
          },
          {
            id: "repo-commits",
            path: "commits/:ref",
            component: () => import("./routes/repo-commits"),
          },
          {
            id: "repo-commit",
            path: "commit/:sha",
            component: () => import("./routes/repo-commit"),
          },
          {
            id: "repo-search",
            path: "search",
            component: () => import("./routes/repo-search"),
          },
          {
            id: "repo-activity",
            path: "activity",
            component: () => import("./routes/repo-activity"),
          },
          {
            id: "repo-settings",
            path: "settings",
            component: () => import("./routes/repo-settings"),
          },
          {
            id: "issues",
            path: "issues",
            component: () => import("./routes/issues"),
          },
          {
            id: "issue-new",
            path: "issues/new",
            component: () => import("./routes/issue-new"),
          },
          {
            id: "issue-detail",
            path: "issue/:number",
            component: () => import("./routes/issue-detail"),
          },
          {
            id: "pulls",
            path: "pulls",
            component: () => import("./routes/pulls"),
          },
          {
            id: "pull-new",
            path: "pulls/new",
            component: () => import("./routes/pull-new"),
          },
          {
            id: "pull-detail",
            path: "pull/:number",
            component: () => import("./routes/pull-detail"),
            children: [
              {
                id: "pull-conversation",
                index: true,
                component: () => import("./routes/pull-conversation"),
              },
              {
                id: "pull-files",
                path: "files-changed",
                component: () => import("./routes/pull-files"),
              },
            ],
          },
        ],
      },
    ],
  },
];
