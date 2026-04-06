declare module "*.css" {}

declare module "*.mdx" {
  import type { ComponentType } from "react";
  const component: ComponentType;
  export default component;
}

declare module "virtual:search-index" {
  interface SearchEntry {
    id: string;
    title: string;
    path: string;
    content: string;
    section: string;
  }
  const entries: SearchEntry[];
  export default entries;
}
