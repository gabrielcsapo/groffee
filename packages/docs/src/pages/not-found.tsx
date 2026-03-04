import { Link } from "react-router";

export function Component() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-4xl font-bold text-text-primary mb-2">404</h1>
      <p className="text-text-secondary mb-6">This page doesn't exist.</p>
      <Link to="/docs/getting-started" className="btn-primary hover:no-underline">
        Back to Docs
      </Link>
    </div>
  );
}
