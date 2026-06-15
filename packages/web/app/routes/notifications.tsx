import { getSessionUser } from "../lib/server/session";

export default async function Notifications() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return (
      <div className="max-w-3xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Sign in required</h1>
          <p className="text-sm text-text-secondary mt-2">
            You must be signed in to view notifications.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mt-8">
      <h1 className="font-editorial font-bold text-3xl text-text-primary lowercase tracking-tight mb-4">
        notifications
      </h1>
      <div className="bg-surface border border-border rounded-lg p-8 text-center">
        <p className="text-sm text-text-secondary">You have no notifications.</p>
        <p className="text-xs text-text-secondary mt-2">
          When you&apos;re mentioned in a comment or assigned to an issue or pull request,
          it&apos;ll show up here.
        </p>
      </div>
    </div>
  );
}
