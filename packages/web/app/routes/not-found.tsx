import { Link } from "react-flight-router/client";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto mt-16 text-center">
      <h1 className="text-6xl font-bold text-text-primary mb-4">404</h1>
      <p className="text-lg text-text-secondary mb-6">The page you're looking for doesn't exist.</p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 hover:no-underline transition-colors"
      >
        Go home
      </Link>
    </div>
  );
}
