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
    title: "Guide",
    items: [
      { label: "Getting Started", to: "/docs/getting-started", file: "getting-started.mdx" },
      { label: "Architecture", to: "/docs/architecture", file: "architecture.mdx" },
      { label: "Configuration", to: "/docs/configuration", file: "configuration.mdx" },
      { label: "Deployment", to: "/docs/deployment", file: "deployment.mdx" },
      { label: "CLI", to: "/docs/cli", file: "cli.mdx" },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "API Reference", to: "/docs/api" },
      { label: "SSH", to: "/docs/ssh", file: "ssh.mdx" },
      { label: "Git LFS", to: "/docs/git-lfs", file: "git-lfs.mdx" },
      { label: "Database Schema", to: "/docs/database", file: "database.mdx" },
    ],
  },
];

export const flatNav: NavItem[] = sections.flatMap((s) => s.items);

export const REPO_URL = "https://github.com/gabrielcsapo/groffee";
export const EDIT_BRANCH = "main";
