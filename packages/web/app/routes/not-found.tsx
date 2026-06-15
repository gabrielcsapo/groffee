import { Link } from "react-flight-router/client";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto mt-20">
      <p className="font-mono text-sm text-text-secondary mb-2">~~~ 404 ~~~</p>
      <h1 className="font-editorial font-black text-6xl text-text-primary mb-3 lowercase tracking-tight">
        nothing here.
      </h1>
      <p className="text-sm text-text-secondary mb-6">
        the page you&apos;re looking for didn&apos;t make it onto the menu.
      </p>
      <Link to="/" className="font-mono text-sm text-accent hover:underline">
        → back home
      </Link>
    </div>
  );
}
