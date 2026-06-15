import { Link } from "react-flight-router/client";

export default function ErrorPage({ error }: { error?: Error; params?: Record<string, string> }) {
  return (
    <div className="max-w-xl mx-auto mt-16">
      <div className="bg-surface border border-border rounded-lg p-6">
        <h1 className="text-xl font-semibold text-text-primary mb-2">Something went wrong</h1>
        {error && (
          <>
            <p className="text-sm text-text-secondary mb-4">{error.message}</p>
            {error.stack && (
              <pre className="text-xs text-text-secondary bg-surface-secondary rounded p-3 overflow-auto max-h-64 mb-4">
                {error.stack}
              </pre>
            )}
          </>
        )}
        <Link to="/" className="btn-secondary btn-sm">
          Go home
        </Link>
      </div>
    </div>
  );
}
