export interface NavItem {
  label: string;
  to: string;
  /** Source filename under packages/docs/src/pages, used for "Edit on GitHub". */
  file?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const sections: NavSection[] = [
  {
    title: "guide",
    items: [
      { label: "getting started", to: "/docs/getting-started", file: "getting-started.mdx" },
      { label: "architecture", to: "/docs/architecture", file: "architecture.mdx" },
      { label: "configuration", to: "/docs/configuration", file: "configuration.mdx" },
      { label: "deployment", to: "/docs/deployment", file: "deployment.mdx" },
      { label: "cli", to: "/docs/cli", file: "cli.mdx" },
    ],
  },
  {
    title: "reference",
    items: [
      { label: "api reference", to: "/docs/api" },
      { label: "ssh", to: "/docs/ssh", file: "ssh.mdx" },
      { label: "git lfs", to: "/docs/git-lfs", file: "git-lfs.mdx" },
      { label: "database schema", to: "/docs/database", file: "database.mdx" },
    ],
  },
];

export const flatNav: NavItem[] = sections.flatMap((s) => s.items);

export const REPO_URL = "https://github.com/gabrielcsapo/groffee";
export const EDIT_BRANCH = "main";
