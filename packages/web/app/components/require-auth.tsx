import { getSessionUser } from "../lib/server/session";
import { RedirectToLogin } from "./redirect-to-login.client";

export async function RequireAuth({
  children,
  returnPath,
}: {
  children: React.ReactNode;
  returnPath: string;
}) {
  const user = await getSessionUser();
  if (!user) {
    return <RedirectToLogin returnPath={returnPath} />;
  }
  return <>{children}</>;
}
