"use client";

interface Deployment {
  id: string;
  commitOid: string;
  status: string;
  deployedBy: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  superseded: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString();
}

export function PagesView({
  deployed,
  url,
  activeDeployment,
  deployments,
}: {
  owner: string;
  repo: string;
  deployed: boolean;
  url: string | null;
  activeDeployment: Deployment | null;
  deployments: Deployment[];
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">Pages</h2>

      {!deployed ? (
        <div className="text-center py-12 text-text-secondary">
          <div className="mb-4">
            <svg
              className="w-12 h-12 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-1">Pages not deployed</h3>
          <p className="text-sm max-w-md mx-auto">
            Add a{" "}
            <code className="px-1.5 py-0.5 bg-surface-secondary rounded text-xs">deploy-pages</code>{" "}
            step to your pipeline configuration to deploy a static site.
          </p>
          <div className="mt-4 text-left max-w-lg mx-auto">
            <pre className="p-4 text-sm bg-surface-secondary rounded-lg overflow-x-auto text-text-primary">
              {`# .groffee/pipelines.yml
pipelines:
  deploy:
    on:
      push:
        branches: [main]
    jobs:
      build:
        name: Build & Deploy
        steps:
          - name: Build
            run: npm run build
          - name: Deploy
            uses: deploy-pages
            with:
              directory: dist`}
            </pre>
          </div>
        </div>
      ) : (
        <div>
          {/* Active deployment card */}
          <div className="border border-border rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-text-primary">Active Deployment</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Live
              </span>
            </div>

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-hover mb-4"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                {url}
              </a>
            )}

            {activeDeployment && (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-text-secondary text-xs mb-1">Commit</div>
                  <span className="font-mono text-xs text-text-primary">
                    {activeDeployment.commitOid.slice(0, 7)}
                  </span>
                </div>
                <div>
                  <div className="text-text-secondary text-xs mb-1">Deployed by</div>
                  <span className="text-text-primary">{activeDeployment.deployedBy}</span>
                </div>
                <div>
                  <div className="text-text-secondary text-xs mb-1">Deployed at</div>
                  <span className="text-text-primary">
                    {formatTime(activeDeployment.createdAt)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Deployment history */}
          {deployments.length > 1 && (
            <div>
              <h3 className="text-sm font-medium text-text-primary mb-3">Deployment History</h3>
              <div className="border border-border rounded-lg overflow-hidden">
                {deployments.map((dep, idx) => (
                  <div
                    key={dep.id}
                    className={`flex items-center gap-4 px-4 py-2.5 ${
                      idx > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[dep.status] || ""}`}
                    >
                      {dep.status}
                    </span>
                    <span className="font-mono text-xs text-text-primary">
                      {dep.commitOid.slice(0, 7)}
                    </span>
                    <span className="text-xs text-text-secondary">by {dep.deployedBy}</span>
                    <span className="text-xs text-text-secondary ml-auto">
                      {formatTime(dep.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
