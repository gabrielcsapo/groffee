import type { ReactNode } from "react";
import { PageNav } from "./page-nav";
import { EditOnGitHub } from "./edit-on-github";

export function MdxArticle({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto">
      <article className="markdown-body">{children}</article>
      <EditOnGitHub />
      <PageNav />
    </div>
  );
}
