import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { MDXProvider } from "@mdx-js/react";
import { router } from "./router";
import { CodeBlock } from "./components/code-block";
import { MdxArticle } from "./components/mdx-article";
import "./styles.css";

const mdxComponents = {
  pre: CodeBlock,
  wrapper: MdxArticle,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MDXProvider components={mdxComponents}>
      <RouterProvider router={router} />
    </MDXProvider>
  </StrictMode>,
);
