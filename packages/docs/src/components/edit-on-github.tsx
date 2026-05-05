import { useLocation } from "react-router";
import { flatNav, REPO_URL, EDIT_BRANCH } from "../nav-data";

export function EditOnGitHub() {
  const location = useLocation();
  const item = flatNav.find((i) => i.to === location.pathname);
  if (!item?.file) return null;

  const url = `${REPO_URL}/edit/${EDIT_BRANCH}/packages/docs/src/pages/${item.file}`;

  return (
    <div className="not-prose mt-12 pt-6 border-t border-border">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        Edit this page on GitHub
      </a>
    </div>
  );
}
